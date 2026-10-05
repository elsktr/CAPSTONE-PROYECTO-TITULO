import type { ArticuloCatalogo, EstadoPedido, Rol } from '@rockstar/contracts';

/** Prenda tal como la muestra la tienda: una variante (talla y color) de un producto. */
export interface Product {
  /** Identificador de la variante en el backend. */
  id: number;
  productId: number;
  sku: string;
  name: string;
  category: string;
  band: string | null;
  price: number;
  size: string;
  color: string;
  /** Unidades que se pueden comprar en este momento. */
  stock: number;
  description?: string;
  image: string;
}

export interface CurrentUser {
  id: number | 'guest';
  name: string;
  email?: string;
  /** Nombre del rol para mostrar. */
  role: string;
  rol: Rol | 'INVITADO';
  /** Cuenta del personal de la tienda. */
  isAdmin: boolean;
}

const ROLE_LABELS: Record<Rol | 'INVITADO', string> = {
  CLIENTE: 'Cliente',
  VENDEDOR: 'Vendedor',
  BODEGA: 'Bodega',
  GERENTE: 'Gerente',
  RRHH: 'RRHH',
  INVITADO: 'Invitado',
};

export function roleLabel(rol: Rol | 'INVITADO'): string {
  return ROLE_LABELS[rol];
}

const ORDER_STATUS_LABELS: Record<EstadoPedido, string> = {
  PAGADO: 'Pagado',
  EN_PREPARACION: 'En preparación',
  DESPACHO_PENDIENTE: 'Preparando despacho',
  ATENCION_MANUAL: 'En revisión',
  DESPACHADO: 'En camino',
  ENTREGADO: 'Entregado',
};

export function orderStatusLabel(estado: EstadoPedido): string {
  return ORDER_STATUS_LABELS[estado];
}

/** Imagen que se muestra cuando un producto no tiene foto o la foto no carga. */
export const PLACEHOLDER_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><rect width="400" height="500" fill="#27272a"/>' +
      '<text x="200" y="260" font-family="sans-serif" font-size="28" fill="#71717a" text-anchor="middle">Sin imagen</text></svg>',
  );

/** Pone la imagen de reemplazo en un `<img>` cuya foto no cargó. */
export function usePlaceholder(event: Event): void {
  const img = event.target as HTMLImageElement;
  if (img.src !== PLACEHOLDER_IMAGE) {
    img.src = PLACEHOLDER_IMAGE;
  }
}

export function toProduct(articulo: ArticuloCatalogo): Product {
  return {
    id: articulo.idVariante,
    productId: articulo.idProducto,
    sku: articulo.sku,
    name: articulo.producto,
    category: articulo.categoria,
    band: articulo.banda,
    price: articulo.precio,
    size: articulo.talla,
    color: articulo.color,
    stock: articulo.disponible,
    ...(articulo.descripcion ? { description: articulo.descripcion } : {}),
    image: articulo.imagenUrl ?? PLACEHOLDER_IMAGE,
  };
}

export const formatCLP = (value: number): string =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);

const DATE_FORMAT = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });

export const formatDate = (iso: string): string => DATE_FORMAT.format(new Date(iso));

const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/** Orden de las tallas: primero las de letras de menor a mayor, luego las numéricas y al final el resto. */
export function compareSizes(a: string, b: string): number {
  const rank = (size: string): number => {
    const letter = LETTER_SIZES.indexOf(size.toUpperCase());
    if (letter >= 0) return letter;
    const number = Number(size);
    return Number.isFinite(number) ? 100 + number : 10_000;
  };
  return rank(a) - rank(b) || a.localeCompare(b, 'es');
}
