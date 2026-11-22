import type { PGlite } from '@electric-sql/pglite';

export function iniciarEntornoLocal(opciones?: {
  puertoApi?: number;
  silencioso?: boolean;
  entorno?: Record<string, string>;
}): Promise<{ apiUrl: string; db: PGlite; detener: () => Promise<void> }>;
