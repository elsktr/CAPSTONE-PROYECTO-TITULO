/**
 * Cálculos del probador virtual: medidas del cuerpo estimadas a partir de la altura y el peso,
 * tabla de medidas por talla y cómo le queda cada talla a ese cuerpo.
 *
 * Todo es una estimación unisex. La tabla de tallas es genérica: para ajustarla a las prendas
 * reales basta con cambiar los rangos de este archivo.
 */

/** Tipos de prenda que el probador sabe simular. */
export type TipoPrenda = 'polera' | 'poleron' | 'chaqueta' | 'pantalon' | 'cinturon';

/** Contextura del cuerpo: ajusta los contornos estimados y el grosor de brazos y piernas. */
export type Complexion = 'delgada' | 'media' | 'robusta';

/** Cuerpo que muestra el maniquí. */
export type Sexo = 'masculino' | 'femenino';

/**
 * Lo que ingresa el cliente: altura en centímetros y peso en kilos, y si las conoce, sus
 * medidas de pecho, cintura y cadera en centímetros. Las que faltan se estiman.
 */
export interface MedidasCliente {
  altura: number;
  peso: number;
  pecho?: number | null;
  cintura?: number | null;
  cadera?: number | null;
  complexion?: Complexion;
  sexo?: Sexo;
}

/** Medidas del cuerpo, en centímetros: las que dio el cliente y las estimadas para el resto. */
export interface MedidasCuerpo {
  altura: number;
  imc: number;
  pecho: number;
  cintura: number;
  cadera: number;
  complexion: Complexion;
  sexo: Sexo;
}

/** Medidas de una talla de un tipo de prenda, en centímetros. */
export interface MedidasTalla {
  talla: string;
  /** Rango del contorno del cuerpo que cubre la talla: desde (incluido) hasta (excluido). */
  desde: number;
  hasta: number;
  /** Contorno de la prenda: el del pecho en prendas de arriba y el de la cintura en pantalones. */
  contornoPrenda: number;
  /** Largo del cuerpo de la prenda, o largo de pierna en pantalones. */
  largo: number;
}

export type AjusteAncho = 'apretada' | 'justa' | 'holgada';
export type AjusteLargo = 'corta' | 'adecuada' | 'larga';

export interface Ajuste {
  talla: string;
  ancho: AjusteAncho;
  largo: AjusteLargo;
  /** Diferencia entre el contorno de la prenda y el del cuerpo, en centímetros. */
  holgura: number;
}

export const LIMITES = {
  altura: { min: 140, max: 210 },
  peso: { min: 35, max: 180 },
  pecho: { min: 60, max: 160 },
  cintura: { min: 50, max: 160 },
  cadera: { min: 60, max: 170 },
} as const;

export const MEDIDAS_POR_DEFECTO: MedidasCliente = { altura: 170, peso: 70 };

/** Cuerpo de referencia con todas sus medidas, para comprobar el maniquí y el ajuste. */
export const MEDIDAS_EJEMPLO: MedidasCliente = { altura: 175, peso: 78, pecho: 100, cintura: 86, cadera: 98, complexion: 'media' };

const NOMBRE_CONTORNO = { pecho: 'El pecho', cintura: 'La cintura', cadera: 'La cadera' } as const;

/** Indica qué está fuera de rango, o `null` si las medidas sirven. Las medidas opcionales vacías se aceptan. */
export function validarMedidas({ altura, peso, ...contornos }: MedidasCliente): string | null {
  if (!Number.isFinite(altura) || altura < LIMITES.altura.min || altura > LIMITES.altura.max) {
    return `La altura debe estar entre ${LIMITES.altura.min} y ${LIMITES.altura.max} cm.`;
  }
  if (!Number.isFinite(peso) || peso < LIMITES.peso.min || peso > LIMITES.peso.max) {
    return `El peso debe estar entre ${LIMITES.peso.min} y ${LIMITES.peso.max} kg.`;
  }
  for (const medida of ['pecho', 'cintura', 'cadera'] as const) {
    const valor = contornos[medida];
    if (valor === undefined || valor === null) continue;
    const { min, max } = LIMITES[medida];
    if (!Number.isFinite(valor) || valor < min || valor > max) {
      return `${NOMBRE_CONTORNO[medida]} debe estar entre ${min} y ${max} cm.`;
    }
  }
  return null;
}

/** Cuánto agranda o achica la contextura los contornos estimados. */
const FACTOR_COMPLEXION: Record<Complexion, number> = { delgada: 0.95, media: 1, robusta: 1.05 };

/** A igual altura y peso, el cuerpo femenino suele tener menos cintura y más cadera. */
const FACTOR_SEXO: Record<Sexo, { cintura: number; cadera: number }> = {
  masculino: { cintura: 1, cadera: 1 },
  femenino: { cintura: 0.92, cadera: 1.07 },
};

/**
 * Usa las medidas que dio el cliente y estima las que faltan. Los contornos estimados son
 * proporcionales a la altura y se corrigen por el IMC respecto de uno de referencia (22) y por
 * la contextura. La cintura es lo que más cambia con el peso, por eso usa un exponente mayor.
 */
export function estimarCuerpo({ altura, peso, pecho, cintura, cadera, complexion = 'media', sexo = 'masculino' }: MedidasCliente): MedidasCuerpo {
  const imc = peso / (altura / 100) ** 2;
  const relacion = imc / 22;
  const factor = FACTOR_COMPLEXION[complexion];
  const redondear = (valor: number) => Math.round(valor * 10) / 10;
  const dada = (valor: number | null | undefined) => (valor === undefined || valor === null ? null : valor);
  return {
    altura,
    imc: redondear(imc),
    pecho: redondear(dada(pecho) ?? 0.53 * altura * relacion ** 0.45 * factor),
    cintura: redondear(dada(cintura) ?? 0.45 * altura * relacion ** 0.75 * factor * FACTOR_SEXO[sexo].cintura),
    cadera: redondear(dada(cadera) ?? 0.54 * altura * relacion ** 0.45 * factor * FACTOR_SEXO[sexo].cadera),
    complexion,
    sexo,
  };
}

/** Texto en minúsculas y sin tildes, para comparar nombres. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Tipo de prenda según el nombre de la categoría, o `null` si el probador no la simula. */
export function tipoDePrenda(categoria: string): TipoPrenda | null {
  const nombre = normalizar(categoria);
  // `polerón` va antes que `polera`: comparten el comienzo.
  if (nombre.includes('poleron') || nombre.includes('hoodie')) return 'poleron';
  if (nombre.includes('polera') || nombre.includes('camiseta')) return 'polera';
  if (nombre.includes('chaqueta')) return 'chaqueta';
  if (nombre.includes('pantalon') || nombre.includes('jeans')) return 'pantalon';
  if (nombre.includes('cinturon')) return 'cinturon';
  return null;
}

/** Contorno de pecho del cuerpo que cubre cada talla de letras. */
const RANGOS_PECHO: [talla: string, desde: number, hasta: number, largoPolera: number][] = [
  ['XS', 82, 88, 66],
  ['S', 88, 96, 69],
  ['M', 96, 104, 72],
  ['L', 104, 112, 75],
  ['XL', 112, 120, 77],
  ['XXL', 120, 128, 79],
];

/** Holgura de cada prenda de arriba sobre el límite superior de su talla, y cuánto más larga es que una polera. */
const CORTE: Record<'polera' | 'poleron' | 'chaqueta', { holgura: number; largoExtra: number }> = {
  polera: { holgura: 6, largoExtra: 0 },
  poleron: { holgura: 12, largoExtra: 2 },
  chaqueta: { holgura: 10, largoExtra: 0 },
};

/** Largo de pierna de los pantalones; es el mismo en todas las tallas. */
const LARGO_PIERNA = 80;
const TALLAS_PANTALON = [38, 40, 42, 44, 46, 48, 50];

/** Medidas de cada talla del tipo de prenda, de menor a mayor. */
export function tablaDeTallas(tipo: TipoPrenda): MedidasTalla[] {
  switch (tipo) {
    case 'polera':
    case 'poleron':
    case 'chaqueta': {
      const { holgura, largoExtra } = CORTE[tipo];
      return RANGOS_PECHO.map(([talla, desde, hasta, largo]) => ({
        talla,
        desde,
        hasta,
        contornoPrenda: hasta + holgura,
        largo: largo + largoExtra,
      }));
    }
    case 'pantalon':
      // La talla chilena N calza con una cintura de alrededor de 2N cm.
      return TALLAS_PANTALON.map((n) => ({
        talla: String(n),
        desde: 2 * n - 2,
        hasta: 2 * n + 2,
        contornoPrenda: 2 * n + 4,
        largo: LARGO_PIERNA,
      }));
    case 'cinturon':
      return [{ talla: 'Única', desde: 60, hasta: 130, contornoPrenda: 130, largo: 0 }];
  }
}

export function medidasDeTalla(tipo: TipoPrenda, talla: string): MedidasTalla | null {
  const buscada = normalizar(talla);
  return tablaDeTallas(tipo).find((medidas) => normalizar(medidas.talla) === buscada) ?? null;
}

/** El contorno del cuerpo con que se elige la talla: pecho arriba, cintura abajo. */
export function contornoDeReferencia(cuerpo: MedidasCuerpo, tipo: TipoPrenda): number {
  return tipo === 'pantalon' || tipo === 'cinturon' ? cuerpo.cintura : cuerpo.pecho;
}

/** Largo que le queda bien a ese cuerpo: del hombro a la cadera arriba, de la entrepierna al tobillo abajo. */
export function largoIdeal(cuerpo: MedidasCuerpo, tipo: TipoPrenda): number {
  return tipo === 'pantalon' ? 0.455 * cuerpo.altura : 0.41 * cuerpo.altura;
}

/** Cuánto más chico que el rango de la talla puede ser el cuerpo antes de que la prenda quede holgada. */
const MARGEN_HOLGADA: Record<TipoPrenda, number> = { polera: 4, poleron: 4, chaqueta: 4, pantalon: 2, cinturon: 0 };

export function evaluarAjuste(cuerpo: MedidasCuerpo, tipo: TipoPrenda, talla: string): Ajuste | null {
  const medidas = medidasDeTalla(tipo, talla);
  if (!medidas) return null;
  const contorno = contornoDeReferencia(cuerpo, tipo);

  let ancho: AjusteAncho = 'justa';
  if (contorno >= medidas.hasta) ancho = 'apretada';
  else if (contorno < medidas.desde - MARGEN_HOLGADA[tipo]) ancho = 'holgada';

  let largo: AjusteLargo = 'adecuada';
  if (tipo !== 'cinturon') {
    const diferencia = medidas.largo - largoIdeal(cuerpo, tipo);
    if (diferencia < -4) largo = 'corta';
    else if (diferencia > 5) largo = 'larga';
  }

  return { talla: medidas.talla, ancho, largo, holgura: Math.round(medidas.contornoPrenda - contorno) };
}

/** La talla cuyo rango contiene el contorno del cuerpo; fuera de la tabla, la del extremo más cercano. */
export function recomendarTalla(cuerpo: MedidasCuerpo, tipo: TipoPrenda): string {
  const tabla = tablaDeTallas(tipo);
  const contorno = contornoDeReferencia(cuerpo, tipo);
  const dentro = tabla.find((medidas) => contorno >= medidas.desde && contorno < medidas.hasta);
  if (dentro) return dentro.talla;
  return contorno < tabla[0]!.desde ? tabla[0]!.talla : tabla[tabla.length - 1]!.talla;
}

export function mismaTalla(a: string, b: string): boolean {
  return normalizar(a) === normalizar(b);
}

const COLORES: [nombre: string, hex: string][] = [
  ['negro', '#1c1c1f'],
  ['blanco', '#ececec'],
  ['gris', '#6b6b72'],
  ['azul', '#2c4a7a'],
  ['celeste', '#7fb2d9'],
  ['rojo', '#a11d24'],
  ['burdeo', '#5e1a24'],
  ['verde', '#2f5d3a'],
  ['cafe', '#5a3b26'],
  ['beige', '#cdbb9a'],
  ['morado', '#4b2a6b'],
  ['amarillo', '#d8b23a'],
  ['naranj', '#c8642a'],
  ['rosad', '#d07a96'],
];

/** Color con que se dibuja la prenda, a partir del nombre del color de la variante. */
export function colorDePrenda(color: string): string {
  const nombre = normalizar(color);
  return COLORES.find(([clave]) => nombre.includes(clave))?.[1] ?? '#3a3a40';
}
