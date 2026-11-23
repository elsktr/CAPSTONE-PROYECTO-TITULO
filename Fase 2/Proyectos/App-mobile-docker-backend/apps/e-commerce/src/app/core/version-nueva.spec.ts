import { describe, expect, it } from 'vitest';

import { esVersionVieja, puedeRecargar } from './version-nueva';

describe('esVersionVieja', () => {
  it('reconoce la página que no se pudo descargar en Chrome, Firefox y Safari', () => {
    expect(esVersionVieja(new TypeError('Failed to fetch dynamically imported module: http://x/chunk-AB12.js'))).toBe(true);
    expect(esVersionVieja(new TypeError('error loading dynamically imported module: http://x/chunk-AB12.js'))).toBe(true);
    expect(esVersionVieja(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('no recarga por otros errores de navegación', () => {
    expect(esVersionVieja(new Error('Cannot match any routes. URL Segment: x'))).toBe(false);
    expect(esVersionVieja(null)).toBe(false);
  });
});

describe('puedeRecargar', () => {
  it('recarga la primera vez y no de nuevo enseguida, para no entrar en un ciclo', () => {
    expect(puedeRecargar(null, 1_000_000)).toBe(true);
    expect(puedeRecargar(1_000_000, 1_005_000)).toBe(false);
    expect(puedeRecargar(1_000_000, 1_011_000)).toBe(true);
  });
});
