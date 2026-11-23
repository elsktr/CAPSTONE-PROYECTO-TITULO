import type { Configuracion } from '../config.js';
import { StarkenRest } from './starken-rest.js';
import { StarkenSimulado, type Transportista } from './transportista.js';

/** Un único punto de decisión: la validación de credenciales ya ocurrió al leer la configuración. */
export function transportistaPara(configuracion: Configuracion): Transportista {
  const { starken } = configuracion;
  return starken.ambiente === 'simulada' ? new StarkenSimulado() : new StarkenRest(starken);
}
