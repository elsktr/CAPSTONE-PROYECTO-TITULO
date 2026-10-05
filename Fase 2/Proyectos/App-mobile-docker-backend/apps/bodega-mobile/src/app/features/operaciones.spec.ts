import { TestBed } from '@angular/core/testing';
import type { Ubicacion } from '@rockstar/contracts';

import { existenciaEn } from '../shared/formato';
import { EntornoDePrueba, configurarEntorno } from '../testing/entorno';
import { ConteoPage } from './conteo/conteo.page';
import { MermaPage } from './merma/merma.page';
import { TraspasoPage } from './traspaso/traspaso.page';

describe('operaciones de inventario', () => {
  let entorno: EntornoDePrueba;

  const existencia = async (codigo: string, ubicacion: Ubicacion) =>
    existenciaEn(await entorno.variante(codigo), ubicacion);

  function crear<T>(componente: new () => T): T {
    const fixture = TestBed.createComponent(componente);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  beforeEach(async () => {
    entorno = configurarEntorno();
    await entorno.iniciarSesion();
  });

  describe('MermaPage', () => {
    let pagina: MermaPage;

    beforeEach(async () => {
      pagina = crear(MermaPage);
      pagina.seleccionar(await entorno.variante('RS-0001'));
    });

    it('registra la merma, descuenta la existencia y actualiza la ficha', async () => {
      pagina.tipo.set('DANADO');
      pagina.cantidad.set('2');
      pagina.motivo.set('Costura rota');

      await pagina.confirmar();

      expect(await existencia('RS-0001', 'BODEGA')).toBe(10);
      expect(existenciaEn(pagina.variante()!, 'BODEGA')).toBe(10);
      expect(pagina.cantidad()).toBe('');
      expect(entorno.avisos.mensajes).toEqual(['Merma registrada: 2 unidades.']);
    });

    it('exige el tipo y el motivo', async () => {
      pagina.cantidad.set('1');
      const solicitudes = entorno.red.solicitudes;

      await pagina.confirmar();

      expect(pagina.mostrarErrores()).toBe(true);
      expect(pagina.errores()).toEqual([
        'Selecciona el tipo de merma: dañado, muestra o cambio.',
        'El motivo es obligatorio.',
      ]);
      expect(entorno.red.solicitudes).toBe(solicitudes);
    });

    it('no registra una merma mayor a la existencia de la ubicación', async () => {
      pagina.ubicacion.set('SALA_VENTAS');
      pagina.tipo.set('MUESTRA');
      pagina.cantidad.set('4');
      pagina.motivo.set('Vitrina');

      await pagina.confirmar();

      expect(pagina.errores()).toEqual(['La cantidad supera la existencia de la ubicación.']);
      expect(await existencia('RS-0001', 'SALA_VENTAS')).toBe(3);
    });

    it('muestra el rechazo del servicio cuando la merma toca unidades reservadas', async () => {
      pagina.seleccionar(await entorno.variante('RS-0002'));
      pagina.tipo.set('CAMBIO');
      pagina.cantidad.set('8');
      pagina.motivo.set('Cambio de cliente');

      await pagina.confirmar();

      expect(pagina.envio.error()).toContain('comprometidas en pedidos');
      expect(pagina.envio.reintentable()).toBe(false);
      expect(await existencia('RS-0002', 'BODEGA')).toBe(8);
    });

    it('no duplica la merma al reintentar tras perderse la respuesta', async () => {
      pagina.tipo.set('DANADO');
      pagina.cantidad.set('2');
      pagina.motivo.set('Mancha');
      entorno.red.pierdeRespuestas = true;

      await pagina.confirmar();
      expect(pagina.envio.reintentable()).toBe(true);
      expect(pagina.cantidad()).toBe('2');

      entorno.red.pierdeRespuestas = false;
      await pagina.confirmar();

      expect(await existencia('RS-0001', 'BODEGA')).toBe(10);
    });
  });

  describe('TraspasoPage', () => {
    let pagina: TraspasoPage;

    beforeEach(async () => {
      pagina = crear(TraspasoPage);
      pagina.seleccionar(await entorno.variante('RS-0001'));
    });

    it('traspasa de bodega a sala de ventas sin cambiar la disponibilidad total', async () => {
      pagina.cantidad.set('3');
      pagina.motivo.set('Reposición de sala');

      await pagina.confirmar();

      expect(await existencia('RS-0001', 'BODEGA')).toBe(9);
      expect(await existencia('RS-0001', 'SALA_VENTAS')).toBe(6);
      expect(pagina.variante()?.disponible).toBe(15);
      expect(entorno.avisos.mensajes).toEqual(['Traspaso registrado: 3 unidades a Sala de ventas.']);
    });

    it('usa como destino la otra ubicación al cambiar el origen', () => {
      expect(pagina.destino()).toBe('SALA_VENTAS');
      pagina.origen.set('SALA_VENTAS');
      expect(pagina.destino()).toBe('BODEGA');
    });

    it('no traspasa más unidades de las que hay en el origen', async () => {
      pagina.origen.set('SALA_VENTAS');
      pagina.cantidad.set('4');
      pagina.motivo.set('Vuelta a bodega');

      await pagina.confirmar();

      expect(pagina.errores()).toEqual(['No hay existencia suficiente en Sala de ventas.']);
      expect(await existencia('RS-0001', 'SALA_VENTAS')).toBe(3);
    });

    it('exige el motivo y una cantidad entera mayor que cero', async () => {
      pagina.cantidad.set('0');

      await pagina.confirmar();

      expect(pagina.errores()).toEqual([
        'La cantidad debe ser un entero mayor que cero.',
        'El motivo es obligatorio.',
      ]);
    });
  });

  describe('ConteoPage', () => {
    let pagina: ConteoPage;

    beforeEach(async () => {
      pagina = crear(ConteoPage);
      pagina.seleccionar(await entorno.variante('RS-0001'));
    });

    it('ajusta la existencia a la cantidad contada e informa la diferencia', async () => {
      pagina.cantidadContada.set('7');
      pagina.motivo.set('Conteo mensual');

      await pagina.confirmar();

      expect(await existencia('RS-0001', 'BODEGA')).toBe(7);
      expect(pagina.ultimoAjuste()).toBe('Ajuste de -5 en Bodega.');
    });

    it('informa cuando el conteo coincide con el sistema', async () => {
      pagina.cantidadContada.set('12');
      pagina.motivo.set('Conteo mensual');

      await pagina.confirmar();

      expect(pagina.ultimoAjuste()).toBe('El conteo coincide con el sistema en Bodega.');
    });

    it('admite una cantidad contada de cero', async () => {
      pagina.ubicacion.set('SALA_VENTAS');
      pagina.cantidadContada.set('0');
      pagina.motivo.set('No se encontraron unidades');

      await pagina.confirmar();

      expect(await existencia('RS-0001', 'SALA_VENTAS')).toBe(0);
    });

    it('exige el motivo y una cantidad contada entera', async () => {
      pagina.cantidadContada.set('2.5');

      await pagina.confirmar();

      expect(pagina.errores()).toEqual([
        'La cantidad contada debe ser un entero mayor o igual a cero.',
        'El motivo es obligatorio.',
      ]);
      expect(await existencia('RS-0001', 'BODEGA')).toBe(12);
    });
  });
});
