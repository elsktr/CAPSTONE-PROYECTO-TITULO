import type { VarianteStock } from '@rockstar/contracts';

/**
 * Espacio de la bodega: la repisa o el colgador donde se guardan uno o más productos, con
 * todas sus tallas y colores. Se identifica por su código, por ejemplo `B-POL-03`: la zona
 * de la categoría y un número correlativo dentro de ella.
 */
export interface Espacio {
  codigo: string;
  /** Las tres letras de la zona: `POL`. */
  zona: string;
  /** El número del espacio dentro de su zona: `03`. */
  numero: string;
  /** Nombres de los productos guardados, sin repetir, en orden alfabético. */
  productos: string[];
  categoria: string;
  /** La banda, si todos sus productos son de la misma; `null` si no. */
  banda: string | null;
  imagenUrl: string | null;
  /** Tallas y colores guardados en el espacio. */
  variantes: number;
  /** Unidades que hay en la bodega; no cuenta las de la sala de ventas. */
  unidadesEnBodega: number;
}

/** Una talla de un modelo guardado en un espacio. */
export interface TallaEnEspacio {
  variante: VarianteStock;
  talla: string;
  enBodega: number;
}

/** Un modelo guardado en un espacio: un producto en un color, con sus tallas. */
export interface ModeloEnEspacio {
  producto: string;
  color: string;
  banda: string | null;
  imagenUrl: string | null;
  /** De la más chica a la más grande. */
  tallas: TallaEnEspacio[];
  unidadesEnBodega: number;
}

const FORMATO = /^B-([^-]+)-(.+)$/i;

/** Orden de las tallas de letras; las numéricas (pantalones) van de menor a mayor. */
const TALLAS_DE_LETRAS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/** Verdadero si el texto tiene la forma del código de un espacio (`B-POL-03`). */
export function esCodigoDeEspacio(texto: string): boolean {
  return FORMATO.test(texto.trim());
}

/** Un espacio por cada código de ubicación, ordenados por zona y número. */
export function agruparEspacios(variantes: VarianteStock[]): Espacio[] {
  const espacios = new Map<string, Espacio>();
  for (const variante of variantes) {
    const codigo = variante.codigoUbicacion;
    let espacio = espacios.get(codigo);
    if (!espacio) {
      const partes = FORMATO.exec(codigo);
      espacio = {
        codigo,
        zona: partes?.[1] ?? '',
        numero: partes?.[2] ?? codigo,
        productos: [],
        categoria: variante.categoria,
        banda: variante.banda,
        imagenUrl: variante.imagenUrl,
        variantes: 0,
        unidadesEnBodega: 0,
      };
      espacios.set(codigo, espacio);
    }
    if (!espacio.productos.includes(variante.producto)) {
      espacio.productos.push(variante.producto);
      espacio.productos.sort((a, b) => a.localeCompare(b, 'es'));
    }
    if (espacio.banda !== variante.banda) {
      espacio.banda = null;
    }
    espacio.variantes += 1;
    espacio.unidadesEnBodega += enBodega(variante);
  }
  // Con `numeric`, B-POL-10 queda después de B-POL-9 y no entre el 1 y el 2.
  return [...espacios.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
}

/** Lo que dice la etiqueta de un espacio bajo su código: el producto, o cuántos modelos guarda. */
export function resumenDeEspacio(espacio: Espacio): string {
  if (espacio.productos.length === 1) {
    return espacio.productos[0]!;
  }
  const modelos = `${espacio.productos.length} modelos`;
  return espacio.banda ? `${espacio.banda} · ${modelos}` : modelos;
}

/**
 * Lo que guarda un espacio, agrupado por modelo (producto y color) con sus tallas de la
 * más chica a la más grande. El código se compara sin distinguir mayúsculas.
 */
export function contenidoDeEspacio(variantes: VarianteStock[], codigo: string): ModeloEnEspacio[] {
  const buscado = codigo.trim().toUpperCase();
  const modelos = new Map<string, ModeloEnEspacio>();
  for (const variante of variantes) {
    if (variante.codigoUbicacion.toUpperCase() !== buscado) {
      continue;
    }
    const clave = `${variante.producto}\u0000${variante.color}`;
    let modelo = modelos.get(clave);
    if (!modelo) {
      modelo = {
        producto: variante.producto,
        color: variante.color,
        banda: variante.banda,
        imagenUrl: variante.imagenUrl,
        tallas: [],
        unidadesEnBodega: 0,
      };
      modelos.set(clave, modelo);
    }
    modelo.tallas.push({ variante, talla: variante.talla, enBodega: enBodega(variante) });
    modelo.unidadesEnBodega += enBodega(variante);
  }
  for (const modelo of modelos.values()) {
    modelo.tallas.sort((a, b) => compararTallas(a.talla, b.talla));
  }
  return [...modelos.values()].sort(
    (a, b) => a.producto.localeCompare(b.producto, 'es') || a.color.localeCompare(b.color, 'es'),
  );
}

/** Ordena XS antes que S y M, y 38 antes que 40; lo demás, alfabéticamente después. */
export function compararTallas(a: string, b: string): number {
  const rango = (talla: string): [number, number] => {
    const letras = TALLAS_DE_LETRAS.indexOf(talla.trim().toUpperCase());
    if (letras >= 0) {
      return [0, letras];
    }
    const numero = Number(talla.replace(',', '.'));
    return Number.isFinite(numero) && talla.trim() !== '' ? [1, numero] : [2, 0];
  };
  const [grupoA, valorA] = rango(a);
  const [grupoB, valorB] = rango(b);
  return grupoA - grupoB || valorA - valorB || a.localeCompare(b, 'es');
}

/** Espacios cuyo código, productos, categoría o banda contienen el texto. */
export function filtrarEspacios(espacios: Espacio[], texto: string): Espacio[] {
  const consulta = texto.trim().toLowerCase();
  if (consulta === '') {
    return espacios;
  }
  return espacios.filter((espacio) =>
    [espacio.codigo, ...espacio.productos, espacio.categoria, espacio.banda ?? ''].some((campo) =>
      campo.toLowerCase().includes(consulta),
    ),
  );
}

function enBodega(variante: VarianteStock): number {
  return variante.existencias.find((e) => e.ubicacion === 'BODEGA')?.cantidad ?? 0;
}
