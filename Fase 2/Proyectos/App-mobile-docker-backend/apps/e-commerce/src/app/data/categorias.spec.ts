import { describe, expect, it } from 'vitest';

import { categoryDescription, categoryKinds, compareCategories } from './categorias';
import type { Product } from './models';

function product(name: string, extra: Partial<Product> = {}): Product {
  return {
    id: 1, productId: 1, sku: 'X', name, category: 'Chaquetas', band: null, price: 10000, listPrice: null,
    size: 'M', color: 'Negro', stock: 1, printType: null, image: '', ...extra,
  };
}

describe('categoryKinds', () => {
  it('distingue el cuero del cuero sintético, sin importar tildes ni mayúsculas', () => {
    expect(categoryKinds('Chaquetas', [product('Chaqueta de Cuero Biker')])).toEqual(['Cuero']);
    expect(categoryKinds('Chaquetas', [product('Chaqueta de Cuero Sintético Burdeo')])).toEqual(['Ecocuero']);
    expect(categoryKinds('Chaquetas', [product('Chaqueta de CUERO SINTETICO')])).toEqual(['Ecocuero']);
  });

  it('lista solo los tipos que tienen productos, en el orden de la categoría', () => {
    const chaquetas = [product('Chaqueta Bomber Negra'), product('Chaqueta de Mezclilla Clásica'), product('Chaqueta de Cuero Rider')];
    expect(categoryKinds('Chaquetas', chaquetas)).toEqual(['Cuero', 'Mezclilla', 'Bomber']);
  });

  it('busca también en la descripción', () => {
    const polerón = product('Polerón Metallica Ride the Lightning', { band: 'Metallica', description: 'Polerón negro con capucha.' });
    expect(categoryKinds('Polerones', [polerón])).toEqual(['Con capucha', 'De bandas']);
  });

  it('separa las poleras de bandas de las estampadas', () => {
    expect(categoryKinds('Poleras', [product('Polera Slipknot Iowa', { band: 'Slipknot' }), product('Polera Calavera')])).toEqual(['De bandas', 'Estampadas']);
  });

  it('no inventa tipos para una categoría que no conoce', () => {
    expect(categoryKinds('Accesorios', [product('Cinturón de tachas')])).toEqual([]);
  });
});

describe('compareCategories', () => {
  it('pone Poleras y Polerones primero y el resto por nombre', () => {
    const categorias = ['Pantalones', 'Accesorios', 'Polerones', 'Chaquetas', 'Poleras'];
    expect([...categorias].sort(compareCategories)).toEqual(['Poleras', 'Polerones', 'Accesorios', 'Chaquetas', 'Pantalones']);
  });
});

describe('categoryDescription', () => {
  it('tiene una descripción propia para las categorías conocidas y una genérica para las demás', () => {
    expect(categoryDescription('Chaquetas')).toContain('cuero');
    expect(categoryDescription('Accesorios')).toBe('Lo último en accesorios de Rockstar, con identidad rockera.');
  });
});
