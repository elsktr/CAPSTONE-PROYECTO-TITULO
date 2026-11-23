import type { Configuracion } from '../config.js';
import { StarkenRest } from './starken-rest.js';
import { StarkenDesactivado, StarkenSimulado, type Transportista } from './transportista.js';

/** Un único punto de decisión: la validación de credenciales ya ocurrió al leer la configuración. */
export function transportistaPara(configuracion: Configuracion): Transportista {
  const { starken } = configuracion;
  switch (starken.ambiente) {
    case 'simulada':
      return new StarkenSimulado();
    case 'desactivado':
      return new StarkenDesactivado();
    default:
      return new StarkenRest(starken);
  }
}
