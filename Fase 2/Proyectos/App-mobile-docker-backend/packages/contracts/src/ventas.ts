import type { LineaPedidoCliente } from './logistica';

/** Datos del destino de una compra web. */
export interface DatosDespacho {
  idComuna: number;
  direccion: string;
  destinatario: string;
  telefono: string;
}

/**
 * POST /ventas/checkout (Cliente)
 *
 * Crea la compra, reserva las unidades por 15 minutos e inicia el pago. Los precios y
 * el flete los pone el servicio: del carrito solo se aceptan las variantes y cantidades.
 * Reenviar la misma clave responde la compra ya creada.
 */
export interface CheckoutRequest {
  /** UUID generado por el cliente; reenviar la misma clave no crea otra compra. */
  claveIdempotencia: string;
  lineas: { idVariante: number; cantidad: number }[];
  despacho: DatosDespacho;
}

export interface CheckoutResponse {
  idVenta: number;
  /** Suma de los productos, sin el flete. */
  subtotal: number;
  flete: number;
  /** Lo que se cobra: productos más flete. */
  total: number;
  /** Identifica el pago en la pasarela; con él se informa el retorno. */
  tokenPago: string;
  /** Hasta cuándo quedan reservadas las unidades. Pasado ese momento la compra expira. */
  expiraEn: string;
}

/** Detalle de un rechazo `STOCK_INSUFICIENTE` del checkout: qué línea ajustar y cuánto hay. */
export interface LineaSinDisponibilidad {
  idVariante: number;
  producto: string;
  talla: string;
  disponible: number;
}

/**
 * POST /pagos/webpay/retorno (público)
 *
 * Resuelve el pago al volver de la pasarela. Es idempotente por token: un pago ya
 * resuelto responde el resultado guardado.
 */
export interface RetornoPagoRequest {
  tokenPago: string;
  /**
   * Solo para la pasarela simulada: `false` simula un pago rechazado por el banco.
   * Con la pasarela real el resultado lo informa ella y este campo se ignora.
   */
  aprobar?: boolean;
}

export type EstadoCompra = 'PAGADA' | 'RECHAZADA' | 'EXPIRADA';

export interface ResultadoPago {
  estado: EstadoCompra;
  idVenta: number;
  total: number;
  /** Número del pedido creado; solo en una compra pagada. */
  idPedido?: number;
  codigoAutorizacion?: string;
  /** Por qué no se cobró; solo en una compra rechazada. */
  motivo?: string;
}

/**
 * Compra iniciada que aún no se paga. GET /ventas/pendientes (Cliente)
 *
 * Solo las vigentes: pasados los 15 minutos de reserva la compra expira y deja de
 * aparecer. Con `tokenPago` se puede retomar el pago.
 */
export interface CompraPendiente extends CheckoutResponse {
  fecha: string;
  lineas: LineaPedidoCliente[];
  destinatario: string;
  direccion: string;
  comuna: string;
  region: string;
}
