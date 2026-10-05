// Configuración de la app instalada en un teléfono (`ng build`, que usa el APK).

/**
 * Dirección del backend fijada al compilar con `--define`, por ejemplo
 * `http://192.168.1.20:3000`. `npm run apk` la completa con la IP de este equipo.
 * Vacía, la app arranca en modo demostración.
 */
declare const SERVIDOR_API: string;

export const environment = {
  production: true,
  // En un teléfono no existe `localhost`: es solo el prefijo que se reemplaza por el servidor elegido.
  apiUrl: 'http://localhost:3000/api/v1',
  useMockApi: SERVIDOR_API === '',
  servidorPorDefecto: SERVIDOR_API,
  servidorConfigurable: true,
};
