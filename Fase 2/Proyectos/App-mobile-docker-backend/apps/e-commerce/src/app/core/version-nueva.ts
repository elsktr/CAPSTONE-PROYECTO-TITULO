import type { NavigationError } from '@angular/router';

/**
 * Cada página de la tienda se descarga aparte al entrar a ella (`chunk-XXXX.js`), y cada
 * versión publicada cambia esos nombres y borra los anteriores. Una pestaña abierta desde
 * antes de publicar pide archivos que ya no existen y la navegación falla sin aviso: el clic
 * en Finanzas o Soporte no hace nada. Ante ese error, la tienda se recarga en la pantalla
 * pedida y así toma la versión nueva.
 */

const CLAVE = 'rockstar.tienda.recarga-por-version';
/** Si la recarga anterior fue hace menos que esto, no se vuelve a recargar: evita un ciclo. */
const ESPERA_MS = 10_000;

/** El error es el de una página que no se pudo descargar (Chrome, Firefox y Safari lo dicen distinto). */
export function esVersionVieja(error: unknown): boolean {
  const texto = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|chunkloaderror|loading chunk .+ failed/i.test(texto);
}

/** Se puede recargar si no hubo otra recarga por versión en los últimos segundos. */
export function puedeRecargar(ultima: number | null, ahora: number): boolean {
  return ultima === null || ahora - ultima > ESPERA_MS;
}

/** Para `withNavigationErrorHandler`: recarga en la pantalla pedida cuando la versión cambió. */
export function recargarSiCambioLaVersion(error: NavigationError): void {
  if (!esVersionVieja(error.error)) {
    return;
  }
  const ahora = Date.now();
  let ultima: number | null = null;
  try {
    ultima = Number(sessionStorage.getItem(CLAVE)) || null;
    if (!puedeRecargar(ultima, ahora)) {
      return;
    }
    sessionStorage.setItem(CLAVE, String(ahora));
  } catch {
    // Sin sessionStorage no hay cómo evitar un ciclo de recargas: mejor no recargar.
    return;
  }
  // La tienda usa rutas con `#`: se deja la pantalla pedida en la dirección y se recarga.
  history.replaceState(history.state, '', `${location.pathname}${location.search}#${error.url}`);
  location.reload();
}
