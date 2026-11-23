import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { VarianteStock } from '@rockstar/contracts';

import { ImpresionService } from '../../shared/impresion.service';
import { EntornoDePrueba, configurarEntorno } from '../../testing/entorno';
import { agruparEspacios, compararTallas, contenidoDeEspacio, esCodigoDeEspacio, filtrarEspacios, resumenDeEspacio } from './espacios';
import { EspaciosPage } from './espacios.page';

function variante(datos: Partial<VarianteStock> & { codigoUbicacion: string }): VarianteStock {
  return {
    idVariante: 1,
    sku: 'RS-0001',
    codigo: '7800000000001',
    producto: 'Polera Calavera',
    categoria: 'Poleras',
    banda: 'Misfits',
    imagenUrl: null,
    talla: 'M',
    color: 'Negro',
    activo: true,
    existencias: [
      { ubicacion: 'BODEGA', cantidad: 0 },
      { ubicacion: 'SALA_VENTAS', cantidad: 0 },
    ],
    reservado: 0,
    disponible: 0,
    ...datos,
  };
}

const enBodega = (bodega: number, sala = 0) => [
  { ubicacion: 'BODEGA' as const, cantidad: bodega },
  { ubicacion: 'SALA_VENTAS' as const, cantidad: sala },
];

describe('espacios de bodega', () => {
  it('reconoce el formato del código de un espacio', () => {
    expect(esCodigoDeEspacio('B-POL-03')).toBe(true);
    expect(esCodigoDeEspacio(' b-cha-01 ')).toBe(true);
    expect(esCodigoDeEspacio('RS-0001')).toBe(false);
    expect(esCodigoDeEspacio('7800000000001')).toBe(false);
  });

  it('junta en un espacio todas las tallas del producto y suma lo que hay en bodega', () => {
    const espacios = agruparEspacios([
      variante({ codigoUbicacion: 'B-POL-01', talla: 'M', existencias: enBodega(12, 3) }),
      variante({ codigoUbicacion: 'B-POL-01', talla: 'L', existencias: enBodega(8, 2) }),
    ]);

    expect(espacios).toEqual([
      {
        codigo: 'B-POL-01',
        zona: 'POL',
        numero: '01',
        productos: ['Polera Calavera'],
        categoria: 'Poleras',
        banda: 'Misfits',
        imagenUrl: null,
        variantes: 2,
        // Las unidades de la sala de ventas no ocupan el espacio de la bodega.
        unidadesEnBodega: 20,
      },
    ]);
  });

  it('un espacio puede guardar varios productos: los nombra a todos y conserva la banda si es común', () => {
    const [maiden] = agruparEspacios([
      variante({ codigoUbicacion: 'B-POL-05', producto: 'Polera Trooper', banda: 'Iron Maiden', existencias: enBodega(4) }),
      variante({ codigoUbicacion: 'B-POL-05', producto: 'Polera Killers', banda: 'Iron Maiden', existencias: enBodega(6) }),
    ]);
    expect(maiden).toMatchObject({ productos: ['Polera Killers', 'Polera Trooper'], banda: 'Iron Maiden', unidadesEnBodega: 10 });
    expect(resumenDeEspacio(maiden!)).toBe('Iron Maiden · 2 modelos');

    const [mezclado] = agruparEspacios([
      variante({ codigoUbicacion: 'B-POL-06', producto: 'Polera Eddie', banda: 'Iron Maiden' }),
      variante({ codigoUbicacion: 'B-POL-06', producto: 'Polera Rayo', banda: 'AC/DC' }),
    ]);
    expect(mezclado!.banda).toBeNull();
    expect(resumenDeEspacio(mezclado!)).toBe('2 modelos');
    expect(resumenDeEspacio(agruparEspacios([variante({ codigoUbicacion: 'B-POL-07' })])[0]!)).toBe('Polera Calavera');
  });

  it('muestra lo que guarda un espacio por modelo, con sus tallas de la S a la XL', () => {
    const variantes = [
      variante({ idVariante: 1, codigoUbicacion: 'B-POL-05', producto: 'Polera Trooper', talla: 'XL', existencias: enBodega(2) }),
      variante({ idVariante: 2, codigoUbicacion: 'B-POL-05', producto: 'Polera Trooper', talla: 'S', existencias: enBodega(3) }),
      variante({ idVariante: 3, codigoUbicacion: 'B-POL-05', producto: 'Polera Trooper', talla: 'M', existencias: enBodega(0, 2) }),
      variante({ idVariante: 4, codigoUbicacion: 'B-POL-05', producto: 'Polera Trooper', talla: 'L', existencias: enBodega(5) }),
      variante({ idVariante: 5, codigoUbicacion: 'B-POL-05', producto: 'Polera Killers', talla: 'M', color: 'Blanco', existencias: enBodega(1) }),
      variante({ idVariante: 6, codigoUbicacion: 'B-POL-05', producto: 'Polera Killers', talla: 'M', color: 'Negro', existencias: enBodega(4) }),
      // Otro espacio cuyo código empieza igual no se mezcla.
      variante({ idVariante: 7, codigoUbicacion: 'B-POL-050', producto: 'Polera Otra' }),
    ];

    const modelos = contenidoDeEspacio(variantes, 'b-pol-05');

    expect(modelos.map((m) => `${m.producto} ${m.color}: ${m.tallas.map((t) => `${t.talla}=${t.enBodega}`).join(' ')} (${m.unidadesEnBodega})`)).toEqual([
      'Polera Killers Blanco: M=1 (1)',
      'Polera Killers Negro: M=4 (4)',
      // Las unidades de la sala de ventas no están en el espacio: la M figura agotada.
      'Polera Trooper Negro: S=3 M=0 L=5 XL=2 (10)',
    ]);
    expect(contenidoDeEspacio(variantes, 'B-POL-99')).toEqual([]);
  });

  it('ordena las tallas de letras y las numéricas', () => {
    expect(['XL', '42', 'S', 'Única', 'XXL', '38', 'M', 'XS'].sort(compararTallas)).toEqual(['XS', 'S', 'M', 'XL', 'XXL', '38', '42', 'Única']);
  });

  it('ordena por zona y por número, no como texto', () => {
    const codigos = ['B-POL-10', 'B-POL-2', 'B-CHA-01', 'B-POL-01'];

    const espacios = agruparEspacios(codigos.map((codigoUbicacion) => variante({ codigoUbicacion })));

    expect(espacios.map((e) => e.codigo)).toEqual(['B-CHA-01', 'B-POL-01', 'B-POL-2', 'B-POL-10']);
  });

  it('filtra por código, producto, categoría o banda', () => {
    const espacios = agruparEspacios([
      variante({ codigoUbicacion: 'B-POL-01' }),
      variante({ codigoUbicacion: 'B-PAN-01', producto: 'Jeans Rasgado', categoria: 'Pantalones', banda: null }),
    ]);
    const codigos = (texto: string) => filtrarEspacios(espacios, texto).map((e) => e.codigo);

    expect(codigos('')).toEqual(['B-PAN-01', 'B-POL-01']);
    expect(codigos('b-pan')).toEqual(['B-PAN-01']);
    expect(codigos('JEANS')).toEqual(['B-PAN-01']);
    expect(codigos('misfits')).toEqual(['B-POL-01']);
    expect(codigos('gorros')).toEqual([]);
  });
});

describe('EspaciosPage', () => {
  let entorno: EntornoDePrueba;
  let fixture: ComponentFixture<EspaciosPage>;
  let pagina: EspaciosPage;
  let imprimir: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    entorno = configurarEntorno();
    // La impresión real abre el diálogo del navegador: se observa sin ejecutarla.
    imprimir = vi.spyOn(TestBed.inject(ImpresionService), 'imprimir').mockImplementation(() => undefined);
    await entorno.iniciarSesion();
    fixture = TestBed.createComponent(EspaciosPage);
    pagina = fixture.componentInstance;
  });

  it('lista un espacio por producto, con su código y número', async () => {
    await pagina.cargar();

    expect(pagina.espacios().map((e) => `${e.codigo} ${e.productos.join(', ')}`)).toEqual([
      'B-CHA-01 Chaqueta de Cuero Rider',
      'B-CIN-01 Cinturón Tachas',
      'B-PAN-01 Jeans Rasgado',
      'B-POE-01 Polerón Banda Tour',
      'B-POL-01 Polera Calavera',
      'B-POL-02 Polera Eddie',
      'B-POL-03 Polera Rayo',
    ]);
    expect(pagina.espacios().find((e) => e.codigo === 'B-POL-01')).toMatchObject({ numero: '01', variantes: 2, unidadesEnBodega: 20 });
  });

  it('dibuja el código QR de cada espacio visible', async () => {
    await pagina.cargar();
    pagina.filtro.set('pol-0');
    fixture.detectChanges();

    const tarjetas = [...(fixture.nativeElement as HTMLElement).querySelectorAll('ion-card')];
    expect(tarjetas.map((t) => t.querySelector('h2')!.textContent)).toEqual(['B-POL-01', 'B-POL-02', 'B-POL-03']);
    expect(tarjetas.map((t) => t.querySelector('svg')!.getAttribute('aria-label'))).toEqual([
      'Código QR de B-POL-01',
      'Código QR de B-POL-02',
      'Código QR de B-POL-03',
    ]);
  });

  it('abre directo la etiqueta del espacio pedido en la dirección', async () => {
    fixture.componentRef.setInput('codigo', 'B-PAN-01');

    await pagina.cargar();
    fixture.detectChanges();

    expect(pagina.elegido()).toMatchObject({ codigo: 'B-PAN-01', zona: 'PAN', numero: '01', productos: ['Jeans Rasgado'] });
    const etiqueta = (fixture.nativeElement as HTMLElement).querySelector('.detalle .rs-etiqueta')!;
    expect(etiqueta.querySelector('.rs-etiqueta-codigo')!.textContent).toBe('B-PAN-01');
    expect(etiqueta.querySelector('svg')!.getAttribute('aria-label')).toBe('Código QR de B-PAN-01');
  });

  it('el código pedido se atiende una vez: volver a la lista no lo reabre, pero otro código sí se abre', async () => {
    fixture.componentRef.setInput('codigo', 'B-PAN-01');
    fixture.detectChanges();
    await pagina.cargar();

    pagina.volverALaLista();
    await pagina.cargar();
    fixture.detectChanges();
    expect(pagina.elegido()).toBeNull();

    fixture.componentRef.setInput('codigo', 'B-CHA-01');
    fixture.detectChanges();
    expect(pagina.elegido()?.codigo).toBe('B-CHA-01');
  });

  it('al escanear la etiqueta de un espacio muestra sus modelos con las tallas', async () => {
    await pagina.cargar();
    entorno.escaner.resultado = { estado: 'leido', codigo: 'b-pol-01' };

    await pagina.escanearEspacio();
    fixture.detectChanges();

    expect(pagina.elegido()?.codigo).toBe('B-POL-01');
    const modelo = (fixture.nativeElement as HTMLElement).querySelector('.modelo')!;
    expect(modelo.querySelector('h4')!.textContent).toBe('Polera Calavera');
    const tallas = [...modelo.querySelectorAll('.tallas li')].map((li) => `${li.querySelector('span')!.textContent} ${li.querySelector('strong')!.textContent}`);
    expect(tallas).toEqual(['M 12', 'L 8']);
  });

  it('avisa si lo escaneado no es la etiqueta de un espacio', async () => {
    await pagina.cargar();
    entorno.escaner.resultado = { estado: 'leido', codigo: '7800000000003' };

    await pagina.escanearEspacio();

    expect(pagina.elegido()).toBeNull();
    expect(pagina.mensaje()).toBe('7800000000003 no es el código de un espacio: escanea la etiqueta de la repisa.');
  });

  it('agrega otro producto al espacio, con todas sus tallas', async () => {
    await pagina.cargar();
    pagina.abrir('B-POL-01');
    pagina.empezarAAgregar();

    pagina.proponer(await entorno.variante('RS-0007'));
    expect(pagina.porMover()?.producto).toBe('Polera Eddie');
    await pagina.mover(pagina.porMover()!);

    expect(pagina.contenido().map((m) => m.producto)).toEqual(['Polera Calavera', 'Polera Eddie']);
    expect(pagina.aviso()).toBe('Polera Eddie quedó en B-POL-01.');
    // El espacio que dejó ya no guarda nada y sale de la lista.
    expect(pagina.espacios().map((e) => e.codigo)).not.toContain('B-POL-02');
    expect(pagina.espacios().find((e) => e.codigo === 'B-POL-01')!.productos).toEqual(['Polera Calavera', 'Polera Eddie']);
  });

  it('no propone mover un producto que ya está en el espacio', async () => {
    await pagina.cargar();
    pagina.abrir('B-POL-01');

    pagina.proponer(await entorno.variante('RS-0002'));

    expect(pagina.porMover()).toBeNull();
    expect(pagina.aviso()).toBe('Polera Calavera ya está en este espacio.');
  });

  it('no mueve un producto a la zona de otra categoría', async () => {
    await pagina.cargar();
    pagina.abrir('B-PAN-01');

    await pagina.mover(await entorno.variante('RS-0007'));

    expect(pagina.mensaje()).toBe('Los productos de Poleras se guardan en los espacios B-POL: no en la zona PAN.');
    expect(pagina.contenido().map((m) => m.producto)).toEqual(['Jeans Rasgado']);
  });

  it('abre vacío un espacio nuevo, para guardar ahí un producto', async () => {
    await pagina.cargar();
    pagina.abrir('B-POL-09');
    expect(pagina.elegido()).toMatchObject({ codigo: 'B-POL-09', zona: 'POL', numero: '09', productos: [] });

    await pagina.mover(await entorno.variante('RS-0008'));

    expect(pagina.contenido().map((m) => m.producto)).toEqual(['Polera Rayo']);
    expect(pagina.elegido()!.productos).toEqual(['Polera Rayo']);
  });

  it('imprime la etiqueta del espacio elegido', async () => {
    await pagina.cargar();
    pagina.codigoElegido.set('B-CHA-01');
    fixture.detectChanges();

    pagina.imprimirElegido();

    const impreso = imprimir.mock.calls[0][0] as HTMLElement;
    expect(impreso.classList.contains('rs-etiqueta')).toBe(true);
    expect(impreso.querySelector('.rs-etiqueta-codigo')!.textContent).toBe('B-CHA-01');
  });

  it('imprime una hoja con las etiquetas de los espacios visibles', async () => {
    await pagina.cargar();
    pagina.filtro.set('poleras');
    fixture.detectChanges();

    pagina.imprimirVisibles();

    const hoja = imprimir.mock.calls[0][0] as HTMLElement;
    expect([...hoja.querySelectorAll('.rs-etiqueta-codigo')].map((e) => e.textContent)).toEqual(['B-POL-01', 'B-POL-02', 'B-POL-03']);
    expect(hoja.querySelectorAll('svg')).toHaveLength(3);
  });

  it('un producto nuevo aparece con el espacio que le asignó el servicio', async () => {
    const creada = await entorno.backend.manejar(
      'POST',
      '/inventario/productos',
      {
        claveIdempotencia: 'espacio-nuevo',
        nombre: 'Polera Nueva',
        categoria: 'Poleras',
        banda: null,
        talla: 'S',
        color: 'Negro',
        cantidad: 5,
        ubicacion: 'BODEGA',
        imagen: 'data:image/png;base64,AAAA',
      },
      entorno.sesion.accessToken(),
    );
    expect(creada.status).toBe(200);

    await pagina.cargar();

    expect(pagina.espacios().find((e) => e.productos.includes('Polera Nueva'))).toMatchObject({
      codigo: 'B-POL-04',
      numero: '04',
      unidadesEnBodega: 5,
    });
  });
});
