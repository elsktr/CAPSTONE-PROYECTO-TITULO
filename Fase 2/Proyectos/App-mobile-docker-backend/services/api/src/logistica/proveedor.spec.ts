import { describe, expect, it } from 'vitest';

import { leerConfiguracion } from '../config.js';
import { transportistaPara } from './proveedor.js';
import { StarkenRest } from './starken-rest.js';
import { StarkenSimulado } from './transportista.js';

const BASE = { DATABASE_URL: 'postgres://postgres:postgres@localhost/postgres' };

describe('selección del proveedor', () => {
  it('el arranque simulado no pide secretos', () => {
    const configuracion = leerConfiguracion(BASE);
    expect(transportistaPara(configuracion)).toBeInstanceOf(StarkenSimulado);
  });

  it('el proveedor real solo se activa con configuración válida', () => {
    const configuracion = leerConfiguracion({
      ...BASE,
      STARKEN_AMBIENTE: 'produccion',
      STARKEN_API_URL: 'https://starken.cl/api',
      STARKEN_USUARIO: 'usuario',
      STARKEN_CLAVE: 'clave',
    });
    expect(transportistaPara(configuracion)).toBeInstanceOf(StarkenRest);
  });
});
