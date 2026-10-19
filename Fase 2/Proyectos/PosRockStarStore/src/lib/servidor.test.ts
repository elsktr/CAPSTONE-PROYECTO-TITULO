import { afterEach, describe, expect, it } from 'vitest';

import { baseApi, elegirServidor, normalizarServidor, servidorActual } from './servidor';

describe('servidor del backend', () => {
  afterEach(() => localStorage.clear());

  it('acepta la dirección con o sin http y sin la barra final', () => {
    expect(normalizarServidor('192.168.1.20:3000')).toBe('http://192.168.1.20:3000');
    expect(normalizarServidor(' http://192.168.1.20:3000/ ')).toBe('http://192.168.1.20:3000');
    expect(normalizarServidor('https://pos.rockstar.cl')).toBe('https://pos.rockstar.cl');
  });

  it('rechaza lo que no es una dirección', () => {
    expect(normalizarServidor('')).toBeNull();
    expect(normalizarServidor('http://')).toBeNull();
    expect(normalizarServidor('dos palabras')).toBeNull();
  });

  it('usa el servidor elegido en el teléfono antes que el de la compilación', () => {
    const deCompilacion = baseApi();
    elegirServidor('http://10.0.0.5:3000');
    expect(baseApi()).toBe('http://10.0.0.5:3000/api/v1');
    expect(servidorActual()).toBe('http://10.0.0.5:3000');
    elegirServidor('');
    expect(baseApi()).toBe(deCompilacion);
  });
});
