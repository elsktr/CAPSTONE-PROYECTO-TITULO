import { describe, expect, it } from 'vitest';

import { leerConfiguracion } from './config.js';

const BASE = { DATABASE_URL: 'postgres://postgres:postgres@localhost/postgres' };

describe('configuración de Starken', () => {
  it('sin credenciales arranca en simulada con los valores por defecto', () => {
    const { starken } = leerConfiguracion(BASE);
    expect(starken).toMatchObject({
      ambiente: 'simulada',
      sincronizacionMs: 60_000,
      tramoPesoGramos: 1_000,
      tramoVolumenCm3: 5_000,
    });
    expect(starken).not.toHaveProperty('apiUrl');
  });

  it('el modo real sin dirección ni credenciales falla con un mensaje claro', () => {
    expect(() => leerConfiguracion({ ...BASE, STARKEN_AMBIENTE: 'produccion' })).toThrow(
      /STARKEN_API_URL, STARKEN_USUARIO y STARKEN_CLAVE/,
    );
    expect(() =>
      leerConfiguracion({ ...BASE, STARKEN_AMBIENTE: 'integracion', STARKEN_API_URL: 'https://starken.cl/api' }),
    ).toThrow(/STARKEN_API_URL, STARKEN_USUARIO y STARKEN_CLAVE/);
  });

  it('el modo real con todos los valores los conserva', () => {
    const { starken } = leerConfiguracion({
      ...BASE,
      STARKEN_AMBIENTE: 'integracion',
      STARKEN_API_URL: 'https://starken.cl/api/',
      STARKEN_USUARIO: 'usuario',
      STARKEN_CLAVE: 'clave',
      STARKEN_SYNC_INTERVAL_MS: '15000',
    });
    expect(starken).toMatchObject({
      ambiente: 'integracion',
      apiUrl: 'https://starken.cl/api',
      usuario: 'usuario',
      clave: 'clave',
      sincronizacionMs: 15_000,
    });
  });

  it('un ambiente desconocido se rechaza', () => {
    expect(() => leerConfiguracion({ ...BASE, STARKEN_AMBIENTE: 'local' })).toThrow(/STARKEN_AMBIENTE/);
  });
});
