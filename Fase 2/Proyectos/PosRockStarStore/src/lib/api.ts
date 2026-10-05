/**
 * Cliente HTTP del POS contra la API Rockstar.
 *
 * - En desarrollo (`npm run dev`) usa VITE_API_URL (http://localhost:3000/api/v1).
 * - En Docker usa el mismo origen (`/api/v1/...`): nginx reenvia al backend,
 *   asi no hay CORS que configurar.
 * - El POS NUNCA se conecta directo a PostgreSQL desde el navegador;
 *   DATABASE_URL es solo para scripts Node (ver .env.example).
 */

// Base de la API: misma origen en Docker, localhost en dev.
const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

async function leerJson(res: Response) {
  const texto = await res.text();
  let cuerpo: unknown = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = { mensaje: texto };
  }
  if (!res.ok) {
    const mensaje =
      typeof cuerpo === 'object' && cuerpo !== null && 'mensaje' in cuerpo
        ? String((cuerpo as { mensaje: unknown }).mensaje)
        : `Error ${res.status}`;
    throw new Error(mensaje);
  }
  return cuerpo;
}

export interface UsuarioSesion {
  id: number;
  nombre: string;
  email: string;
  rol: string;
}

export interface Sesion {
  accessToken: string;
  refreshToken: string;
  usuario: UsuarioSesion;
}

/** Prenda a la venta. GET /inventario/catalogo (publico, sin token). */
export interface ArticuloCatalogo {
  idVariante: number;
  idProducto: number;
  sku: string;
  producto: string;
  categoria: string;
  banda: string | null;
  talla: string;
  color: string;
  precio: number;
  descripcion: string | null;
  imagenUrl: string | null;
  disponible: number;
}

/** Prefijo con que el backend informa las fotos (`assets/prendas/<archivo>`). */
const PRENDAS_BACKEND = 'assets/prendas/';

/** Las fotos se sirven desde el propio contenedor (ver `public/prendas/`). */
const PRENDAS_LOCAL = '/prendas/';

/**
 * URL de imagen lista para `<img>`: las fotos del backend (`assets/prendas/*`)
 * se resuelven al mismo origen del POS (nginx las sirve desde `dist/prendas/`),
 * las absolutas se usan tal cual y `null` mantiene el placeholder.
 */
export function getImageUrl(variante: { imagenUrl: string | null }): string | null {
  const raw = variante.imagenUrl?.trim();
  if (!raw) return null;
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const sinBarra = raw.replace(/^\/+/, '');
  if (sinBarra.startsWith(PRENDAS_BACKEND)) {
    return PRENDAS_LOCAL + sinBarra.slice(PRENDAS_BACKEND.length);
  }
  if (sinBarra.startsWith('prendas/')) return '/' + sinBarra;
  return raw.startsWith('/') ? raw : '/' + raw;
}

/** Variante para POS/ventas. GET /inventario/productos (roles VENDEDOR, BODEGA, GERENTE). */
export interface VarianteGestion {
  id: number;
  idProducto: number;
  sku: string;
  codigo: string;
  producto: string;
  categoria: string;
  banda: string | null;
  talla: string;
  color: string;
  precio: number | null;
  descripcion: string | null;
  stockTotal: number;
  disponible: number;
}

/** GET /salud: el backend responde { estado: 'ok' }. */
export async function salud(): Promise<boolean> {
  const res = await fetch(`${BASE}/salud`);
  const cuerpo = (await leerJson(res)) as { estado?: string };
  return cuerpo.estado === 'ok';
}

/** POST /usuarios/auth/login con { email, password }. Cuentas demo en README. */
export async function login(email: string, password: string): Promise<Sesion> {
  const res = await fetch(`${BASE}/usuarios/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await leerJson(res)) as Sesion;
}

/** GET /inventario/catalogo: lo que ve un cliente (con precio y stock). */
export async function getCatalogo(): Promise<ArticuloCatalogo[]> {
  const res = await fetch(`${BASE}/inventario/catalogo`);
  return (await leerJson(res)) as ArticuloCatalogo[];
}

/**
 * GET /inventario/productos: catalogo de gestion para el POS
 * (todas las variantes, tengan precio o no). Requiere token de
 * VENDEDOR, BODEGA o GERENTE. Estos son los productos de las pruebas.
 */
export async function getProductos(accessToken: string): Promise<VarianteGestion[]> {
  const res = await fetch(`${BASE}/inventario/productos`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (await leerJson(res)) as VarianteGestion[];
}

/** GET /inventario/variantes?q=... : busqueda por SKU, producto o banda (mismo token). */
export async function buscarVariantes(
  accessToken: string,
  q: string,
): Promise<VarianteGestion[]> {
  const res = await fetch(`${BASE}/inventario/variantes?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (await leerJson(res)) as VarianteGestion[];
}

export interface DatosDespacho {
  tipo: 'retiro';
  comuna: string;
  direccion: string;
  referencia?: string;
}

export interface LineaCheckout {
  idVariante: number;
  cantidad: number;
}

export interface CheckoutRequest {
  claveIdempotencia: string;
  lineas: LineaCheckout[];
  despacho: DatosDespacho;
}

export interface CheckoutResponse {
  idVenta: number;
  subtotal: number;
  flete: number;
  total: number;
  tokenPago: string;
  expiraEn: string;
}

export interface RetornoPagoRequest {
  tokenPago: string;
  aprobar?: boolean;
}

export interface RetornoPagoResponse {
  estado: string;
  idVenta: number;
  total: number;
  idPedido?: number;
  motivo?: string;
}

export interface VentaPendiente {
  idVenta: number;
  fecha: string;
  total: number;
  medioPago: string;
  estado: string;
}

export async function crearCheckout(
  accessToken: string,
  datos: CheckoutRequest
): Promise<CheckoutResponse> {
  const res = await fetch(`${BASE}/ventas/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(datos),
  });
  return (await leerJson(res)) as CheckoutResponse;
}

export async function retornoPago(
  accessToken: string,
  datos: RetornoPagoRequest
): Promise<RetornoPagoResponse> {
  const res = await fetch(`${BASE}/pagos/webpay/retorno`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(datos),
  });
  return (await leerJson(res)) as RetornoPagoResponse;
}

export async function getPendientes(accessToken: string): Promise<VentaPendiente[]> {
  const res = await fetch(`${BASE}/ventas/pendientes`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return (await leerJson(res)) as VentaPendiente[];
}
