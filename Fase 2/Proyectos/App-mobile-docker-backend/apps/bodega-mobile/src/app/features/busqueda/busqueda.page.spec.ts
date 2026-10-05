import { TestBed } from '@angular/core/testing';
import type { Busqueda } from '@rockstar/contracts';

import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { BusquedaPage, SIN_BANDA } from './busqueda.page';

describe('BusquedaPage', () => {
  let entorno: EntornoDePrueba;
  let pagina: BusquedaPage;

  /** Estado de una búsqueda en el servicio; cerrarla de nuevo no la modifica. */
  const enServicio = (idBusqueda: number) =>
    entorno.backend.manejar(
      'PATCH',
      `/inventario/busquedas/${idBusqueda}`,
      { resultado: 'CANCELADA' },
      entorno.sesion.accessToken(),
    ).body as Busqueda;

  beforeEach(async () => {
    entorno = configurarEntorno();
    await entorno.iniciarSesion();
    const fixture = TestBed.createComponent(BusquedaPage);
    fixture.detectChanges();
    pagina = fixture.componentInstance;
    pagina.seleccionar(await entorno.variante('RS-0003'));
  });

  afterEach(() => pagina.ngOnDestroy());

  it('registra la duración cuando se escanea la prenda buscada', async () => {
    await pagina.iniciar();
    const { idBusqueda } = pagina.busqueda()!;
    entorno.escaner.resultado = { estado: 'leido', codigo: '7800000000003' };

    await pagina.escanearEncontrada();

    expect(pagina.busqueda()?.duracionSegundos).toEqual(expect.any(Number));
    expect(enServicio(idBusqueda).duracionSegundos).toEqual(expect.any(Number));
  });

  it('no da por encontrada una prenda de otro producto', async () => {
    await pagina.iniciar();
    entorno.escaner.resultado = { estado: 'leido', codigo: '7800000000001' };

    await pagina.escanearEncontrada();

    expect(pagina.mensaje()).toBe('La prenda escaneada no corresponde al producto buscado.');
    expect(pagina.busqueda()?.duracionSegundos).toBeUndefined();
  });

  it('no registra duración cuando la búsqueda se cancela', async () => {
    await pagina.iniciar();
    const { idBusqueda } = pagina.busqueda()!;

    await pagina.cancelar();

    expect(pagina.busqueda()).toBeNull();
    expect(enServicio(idBusqueda).duracionSegundos).toBeUndefined();
  });

  it('permite confirmar con el código escrito cuando el escáner no está disponible', async () => {
    await pagina.iniciar();
    entorno.escaner.resultado = { estado: 'no-disponible', motivo: 'Sin cámara' };

    await pagina.escanearEncontrada();
    expect(pagina.escanerNoDisponible()).toBe(true);

    await pagina.confirmarCodigo(' RS-0003 ');
    expect(pagina.busqueda()?.duracionSegundos).toEqual(expect.any(Number));
  });

  describe('tarjetas de stock', () => {
    it('agrupa las variantes en una tarjeta por producto con sus unidades', async () => {
      await pagina.cargar();

      expect(pagina.grupos().map((g) => [g.producto, g.variantes.map((v) => v.sku), g.unidades])).toEqual([
        ['Polera Calavera', ['RS-0001', 'RS-0002'], 25],
        ['Chaqueta de Cuero Rider', ['RS-0003'], 5],
        ['Jeans Rasgado', ['RS-0004'], 6],
        ['Polerón Banda Tour', ['RS-0005'], 0],
        ['Cinturón Tachas', ['RS-0006'], 10],
        ['Polera Eddie', ['RS-0007'], 11],
        ['Polera Rayo', ['RS-0008'], 6],
      ]);
    });

    it('ofrece las categorías del catálogo en orden alfabético', async () => {
      await pagina.cargar();

      expect(pagina.categorias().map((c) => c.nombre)).toEqual(['Chaquetas', 'Cinturones', 'Pantalones', 'Poleras', 'Polerones']);
    });

    it('sin categoría elegida solo ofrece el filtro de banda', async () => {
      await pagina.cargar();

      expect(pagina.categoriaElegida()).toBeNull();
      expect(pagina.filtraPorBanda()).toBe(true);
      expect(pagina.coloresDeCategoria()).toEqual([]);
    });

    it('al elegir Pantalones ofrece las tallas 38 a 50 y sus colores, sin filtro de banda', async () => {
      await pagina.cargar();

      pagina.seleccionarCategoria('Pantalones');

      expect(pagina.categoriaElegida()?.tallas).toEqual(['38', '40', '42', '44', '46', '48', '50']);
      expect(pagina.coloresDeCategoria()).toEqual(['Azul']);
      expect(pagina.filtraPorBanda()).toBe(false);
    });

    it('al elegir Poleras ofrece las bandas, las tallas de letras y sus colores', async () => {
      await pagina.cargar();

      pagina.seleccionarCategoria('Poleras');

      expect(pagina.filtraPorBanda()).toBe(true);
      expect(pagina.categoriaElegida()?.tallas).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
      expect(pagina.coloresDeCategoria()).toEqual(['Negro']);
    });

    it('filtra por talla dentro de la categoría y deja solo las variantes de esa talla', async () => {
      await pagina.cargar();
      pagina.seleccionarCategoria('Poleras');

      pagina.seleccionarTalla('L');
      expect(pagina.grupos().map((g) => [g.producto, g.variantes.map((v) => v.sku)])).toEqual([
        ['Polera Calavera', ['RS-0002']],
        ['Polera Rayo', ['RS-0008']],
      ]);

      pagina.seleccionarTalla('XS');
      expect(pagina.grupos()).toEqual([]);

      pagina.seleccionarTalla('');
      expect(pagina.grupos()).toHaveLength(3);
    });

    it('filtra por color dentro de la categoría', async () => {
      await pagina.cargar();
      pagina.seleccionarCategoria('Pantalones');

      pagina.seleccionarColor('Azul');
      expect(pagina.grupos().map((g) => g.producto)).toEqual(['Jeans Rasgado']);

      pagina.seleccionarTalla('44');
      expect(pagina.grupos()).toEqual([]);
    });

    it('reinicia la talla, el color y la banda que no corresponden al cambiar de categoría', async () => {
      await pagina.cargar();
      pagina.seleccionarCategoria('Poleras');
      pagina.seleccionarBanda('Misfits');
      pagina.seleccionarTalla('L');
      pagina.seleccionarColor('Negro');

      pagina.seleccionarCategoria('Pantalones');

      expect(pagina.talla()).toBeNull();
      expect(pagina.color()).toBeNull();
      expect(pagina.valorBanda()).toBe('');
      expect(pagina.grupos().map((g) => g.producto)).toEqual(['Jeans Rasgado']);
    });

    it('conserva la banda elegida al pasar a otra categoría que también tiene bandas', async () => {
      await pagina.cargar();
      pagina.seleccionarCategoria('Poleras');
      pagina.seleccionarBanda('Metallica');

      pagina.seleccionarCategoria('Polerones');

      expect(pagina.valorBanda()).toBe('Metallica');
      expect(pagina.grupos().map((g) => g.producto)).toEqual(['Polerón Banda Tour']);
    });

    it('filtra las tarjetas por categoría y muestra la categoría de cada producto', async () => {
      await pagina.cargar();

      pagina.seleccionarCategoria('Cinturones');
      expect(pagina.grupos().map((g) => [g.producto, g.categoria])).toEqual([['Cinturón Tachas', 'Cinturones']]);

      pagina.seleccionarCategoria('Polerones');
      expect(pagina.grupos().map((g) => g.producto)).toEqual(['Polerón Banda Tour']);

      pagina.seleccionarCategoria('Pantalones');
      expect(pagina.grupos().map((g) => g.producto)).toEqual(['Jeans Rasgado']);

      pagina.seleccionarCategoria('Poleras');
      expect(pagina.grupos().map((g) => g.producto)).toEqual(['Polera Calavera', 'Polera Eddie', 'Polera Rayo']);
    });

    it('vuelve a mostrar todas las categorías al elegir "Todas" en la lista', async () => {
      await pagina.cargar();

      pagina.seleccionarCategoria('Pantalones');
      expect(pagina.valorCategoria()).toBe('Pantalones');

      pagina.seleccionarCategoria('');

      expect(pagina.categoria()).toBeNull();
      expect(pagina.valorCategoria()).toBe('');
      expect(pagina.grupos()).toHaveLength(7);
    });

    it('combina la categoría con la banda y con el texto', async () => {
      await pagina.cargar();

      pagina.seleccionarCategoria('Poleras');
      pagina.seleccionarBanda('AC/DC');
      expect(pagina.grupos().map((g) => g.producto)).toEqual(['Polera Rayo']);

      pagina.seleccionarBanda('Metallica');
      expect(pagina.grupos()).toEqual([]);

      pagina.seleccionarBanda('');
      pagina.filtro.set('eddie');
      expect(pagina.grupos().map((g) => g.producto)).toEqual(['Polera Eddie']);
    });

    it('encuentra por nombre de categoría al escribir en el buscador', async () => {
      await pagina.cargar();

      pagina.filtro.set('cinturones');

      expect(pagina.grupos().map((g) => g.producto)).toEqual(['Cinturón Tachas']);
    });

    it('ofrece las bandas del catálogo en orden alfabético', async () => {
      await pagina.cargar();

      expect(pagina.bandas()).toEqual(['AC/DC', 'Iron Maiden', 'Metallica', 'Misfits']);
      expect(pagina.hayPrendasSinBanda()).toBe(true);
    });

    it('filtra las tarjetas por banda y muestra la banda de cada producto', async () => {
      await pagina.cargar();

      pagina.seleccionarBanda('Misfits');
      expect(pagina.grupos().map((g) => [g.producto, g.banda, g.variantes.length])).toEqual([
        ['Polera Calavera', 'Misfits', 2],
      ]);

      pagina.seleccionarBanda('Iron Maiden');
      expect(pagina.grupos().map((g) => g.producto)).toEqual(['Polera Eddie']);
    });

    it('vuelve a mostrar todas las bandas al elegir "Todas" en la lista', async () => {
      await pagina.cargar();

      pagina.seleccionarBanda('Metallica');
      expect(pagina.valorBanda()).toBe('Metallica');
      expect(pagina.grupos()).toHaveLength(1);

      pagina.seleccionarBanda('');
      expect(pagina.valorBanda()).toBe('');
      expect(pagina.grupos()).toHaveLength(7);

      pagina.seleccionarBanda(SIN_BANDA);
      expect(pagina.valorBanda()).toBe(SIN_BANDA);
    });

    it('filtra las prendas que no son de ninguna banda', async () => {
      await pagina.cargar();

      pagina.seleccionarBanda(SIN_BANDA);

      expect(pagina.grupos().map((g) => g.producto)).toEqual([
        'Chaqueta de Cuero Rider',
        'Jeans Rasgado',
        'Cinturón Tachas',
      ]);
    });

    it('combina el filtro de banda con el texto y encuentra por nombre de banda', async () => {
      await pagina.cargar();

      pagina.filtro.set('maiden');
      expect(pagina.grupos().map((g) => g.producto)).toEqual(['Polera Eddie']);

      pagina.filtro.set('rs-0002');
      pagina.seleccionarBanda('Misfits');
      expect(pagina.grupos().map((g) => g.variantes.map((v) => v.sku))).toEqual([['RS-0002']]);

      pagina.seleccionarBanda('AC/DC');
      expect(pagina.grupos()).toEqual([]);
    });

    it('filtra las tarjetas por nombre o SKU', async () => {
      await pagina.cargar();

      pagina.filtro.set('jeans');
      expect(pagina.grupos().map((g) => g.producto)).toEqual(['Jeans Rasgado']);

      pagina.filtro.set('rs-0002');
      expect(pagina.grupos().map((g) => g.variantes.map((v) => v.sku))).toEqual([['RS-0002']]);

      pagina.filtro.set('inexistente');
      expect(pagina.grupos()).toEqual([]);
    });

    it('refleja el stock actualizado al volver a entrar a la pantalla', async () => {
      entorno.backend.manejar(
        'POST',
        '/inventario/movimientos/ingresos',
        { claveIdempotencia: 'tarjetas', ubicacion: 'BODEGA', lineas: [{ idVariante: 4, cantidad: 4 }] },
        entorno.sesion.accessToken(),
      );

      await pagina.cargar();

      expect(pagina.grupos().find((g) => g.producto === 'Jeans Rasgado')?.unidades).toBe(10);
    });

    it('no permite elegir una variante desactivada', async () => {
      pagina.reiniciar();

      pagina.seleccionar(await entorno.variante('RS-0006'));

      expect(pagina.variante()).toBeNull();
    });

    it('informa la falla de conexión al cargar el stock', async () => {
      entorno.red.caida = true;

      await pagina.cargar();

      expect(pagina.grupos()).toEqual([]);
      expect(pagina.mensaje()).toContain('No hay conexión');
    });
  });

  it('informa la falla de conexión al iniciar y no deja una búsqueda en curso', async () => {
    entorno.red.caida = true;

    await pagina.iniciar();

    expect(pagina.busqueda()).toBeNull();
    expect(pagina.mensaje()).toContain('No hay conexión');
  });
});
