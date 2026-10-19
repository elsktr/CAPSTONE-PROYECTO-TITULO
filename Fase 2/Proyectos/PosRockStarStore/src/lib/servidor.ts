/**
 * Dirección del backend.
 *
 * En el navegador (Docker o `npm run dev`) se usa la de la compilación: `/api/v1` del mismo
 * origen o VITE_API_URL. En la app instalada en un teléfono no hay mismo origen: el APK trae
 * la IP del equipo donde se compiló (`npm run apk`), y se puede cambiar desde el inicio de
 * sesión si el servidor cambia de dirección en la red.
 */
import { Capacitor } from '@capacitor/core';

const CLAVE = 'rockstar.pos.servidor';

/** La app corre instalada en un teléfono, no en un navegador. */
export const esAppInstalada = Capacitor.isNativePlatform();

/** "192.168.1.20:3000", "http://192.168.1.20:3000/" -> "http://192.168.1.20:3000"; `null` si no es una dirección. */
export function normalizarServidor(texto: string): string | null {
  const limpio = texto.trim();
  if (limpio === '') return null;
  try {
    const url = new URL(/^https?:\/\//i.test(limpio) ? limpio : `http://${limpio}`);
    return url.hostname === '' ? null : url.origin;
  } catch {
    return null;
  }
}

/** La dirección elegida en el teléfono; vacía si se usa la de la compilación. */
export function servidorElegido(): string {
  try {
    return localStorage.getItem(CLAVE) ?? '';
  } catch {
    return '';
  }
}

export function elegirServidor(direccion: string): void {
  try {
    localStorage.setItem(CLAVE, direccion);
  } catch {
    // Sin almacenamiento, la dirección dura lo que la app siga abierta.
  }
}

/** Base de todas las rutas de la API, por ejemplo "http://192.168.1.20:3000/api/v1". */
export function baseApi(): string {
  const elegido = servidorElegido();
  return elegido ? `${elegido}/api/v1` : (import.meta.env.VITE_API_URL ?? '/api/v1');
}

/** El servidor al que apunta la app ahora, sin el `/api/v1`, para mostrarlo. */
export function servidorActual(): string {
  return baseApi().replace(/\/api\/v1\/?$/, '') || 'este mismo origen';
}
