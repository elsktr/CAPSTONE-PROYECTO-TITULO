import type { Product } from './models';

/** Un tipo de prenda dentro de una categoría, por ejemplo "Cuero" en Chaquetas. */
interface Kind {
  label: string;
  /** Si el producto es de este tipo, mirando su nombre, descripción y banda. */
  matches: (product: Product) => boolean;
}

interface CategoryInfo {
  description: string;
  kinds: Kind[];
}

/** Busca en el nombre y la descripción, sin distinguir mayúsculas ni tildes. */
function text(pattern: RegExp): (product: Product) => boolean {
  return (product) => pattern.test(plain(`${product.name} ${product.description ?? ''}`));
}

function plain(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const ECOCUERO = /cuero sintetico|ecocuero/;

/**
 * Lo que la portada cuenta de cada categoría. Los tipos se muestran solo si hay al menos un
 * producto publicado de ese tipo, así que agregar uno aquí no inventa nada en la tienda.
 */
const CATEGORIES: Readonly<Record<string, CategoryInfo>> = {
  Poleras: {
    description:
      'Algodón negro con el arte de los discos que marcaron el rock y el metal. La polera de tu banda, para el concierto y para el resto del año.',
    kinds: [
      { label: 'De bandas', matches: (p) => p.band !== null },
      { label: 'Estampadas', matches: (p) => p.band === null },
    ],
  },
  Polerones: {
    description:
      'Polerones con el arte de tus discos favoritos, para las noches de invierno y las filas eternas antes del show.',
    kinds: [
      { label: 'Con capucha', matches: text(/capucha/) },
      { label: 'De bandas', matches: (p) => p.band !== null },
      { label: 'Estampados', matches: (p) => p.band === null },
    ],
  },
  Chaquetas: {
    description:
      'La pieza que define el look: cuero que aguanta el pogo, mezclilla lista para parches y bombers para la vuelta a casa.',
    kinds: [
      { label: 'Cuero', matches: (p) => text(/cuero/)(p) && !text(ECOCUERO)(p) },
      { label: 'Ecocuero', matches: text(ECOCUERO) },
      { label: 'Mezclilla', matches: text(/mezclilla|denim/) },
      { label: 'Bomber', matches: text(/bomber/) },
      { label: 'Militar', matches: text(/militar/) },
    ],
  },
  Pantalones: {
    description:
      'Jeans rasgados, cargos con bolsillos de sobra y el escocés del punk inglés. Cortes ajustados y holgados para moverse en primera fila.',
    kinds: [
      { label: 'Jeans', matches: text(/jeans|mezclilla/) },
      { label: 'Cargo', matches: text(/cargo/) },
      { label: 'Escocés', matches: text(/escoces/) },
      { label: 'Ecocuero', matches: text(ECOCUERO) },
    ],
  },
};

/** Categorías que la tienda muestra primero, en este orden; las demás van después, por nombre. */
const FIRST_CATEGORIES = ['Poleras', 'Polerones'];

/** Orden de las categorías en la portada, el menú y el pie de página. */
export function compareCategories(a: string, b: string): number {
  const rank = (name: string) => {
    const i = FIRST_CATEGORIES.indexOf(name);
    return i === -1 ? FIRST_CATEGORIES.length : i;
  };
  return rank(a) - rank(b) || a.localeCompare(b, 'es');
}

/** Descripción de la categoría para su tarjeta en la portada. */
export function categoryDescription(category: string): string {
  return CATEGORIES[category]?.description ?? `Lo último en ${category.toLowerCase()} de Rockstar, con identidad rockera.`;
}

/** Los tipos de prenda de la categoría que tienen al menos un producto entre `products`. */
export function categoryKinds(category: string, products: readonly Product[]): string[] {
  return (CATEGORIES[category]?.kinds ?? []).filter((kind) => products.some(kind.matches)).map((kind) => kind.label);
}
