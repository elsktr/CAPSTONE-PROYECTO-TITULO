import type { Ubicacion } from './inventario';
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

// --- Venta en tienda (POS) ---

/** Medios con que se cobra en la tienda. La tarjeta se pasa por el terminal físico: el POS solo registra el medio. */
export type MedioPresencial = 'EFECTIVO' | 'DEBITO_PRESENCIAL' | 'CREDITO_PRESENCIAL';

export interface LineaVentaPos {
  idVariante: number;
  cantidad: number;
  /**
   * La venta sale de la sala de ventas. Con `true`, lo que falte en sala se retira de
   * bodega; sin él, una línea que la sala no alcanza se rechaza con `EXISTENCIA_EN_BODEGA`.
   */
  permitirBodega?: boolean;
}

/**
 * POST /ventas/pos (Vendedor)
 *
 * Registra la venta, descuenta el stock y emite el comprobante, todo de una vez: el
 * comprador se lleva la prenda. Sin flete ni despacho. Reenviar la misma clave responde
 * el comprobante ya emitido.
 */
export interface VentaPosRequest {
  /** UUID generado por el POS; reenviar la misma clave no crea otra venta. */
  claveIdempotencia: string;
  lineas: LineaVentaPos[];
  medioPago: MedioPresencial;
  /** Cliente identificado en el mostrador, si lo hay. */
  idCliente?: number;
}

/** Detalle de un rechazo `EXISTENCIA_EN_BODEGA`: líneas que se pueden vender retirándolas de bodega. */
export interface LineaEnBodega {
  idVariante: number;
  producto: string;
  talla: string;
  enSala: number;
  enBodega: number;
}

export interface LineaComprobantePos extends LineaPedidoCliente {
  /** De dónde salieron las unidades. Una línea repartida entre sala y bodega aparece dos veces. */
  ubicacion: Ubicacion;
  subtotal: number;
}

/** Comprobante interno de una venta POS; sin validez tributaria. También GET /ventas/pos (Vendedor: las suyas; Gerente: todas). */
export interface ComprobantePos {
  idVenta: number;
  fecha: string;
  vendedor: string;
  cliente: string | null;
  medioPago: { codigo: MedioPresencial; nombre: string };
  lineas: LineaComprobantePos[];
  total: number;
}

// --- Ventas de todos los canales (Finanzas) ---

/** Por dónde entró la venta: la tienda web o el POS de la tienda física. */
export type CanalVenta = 'ECOMMERCE' | 'POS';

/**
 * Venta pagada de cualquier canal. GET /ventas (Gerente)
 *
 * Con `?desde=AAAA-MM-DD` solo las de ese día en adelante (hora de Chile). De la más
 * reciente a la más antigua.
 */
export interface VentaResumen {
  idVenta: number;
  fecha: string;
  canal: CanalVenta;
  /** Lo cobrado, con el flete incluido en las ventas web. */
  total: number;
  /** Parte del total que pagó el cliente por el despacho; 0 en el POS. */
  flete: number;
  unidades: number;
  cliente: string | null;
  /** Quien registró la venta en el POS; `null` en las ventas web. */
  vendedor: string | null;
  /** Nombre del medio de pago, si ya se conoce. */
  medioPago: string | null;
}

/**
 * Ingresos y gastos de un día, en hora de Chile. GET /finanzas/balance (Gerente)
 *
 * Solo los días con ventas o mermas, del más reciente al más antiguo. Con
 * `?desde=AAAA-MM-DD`, solo desde ese día. Ganancia = ingresos − gastos.
 */
export interface BalanceDia {
  /** AAAA-MM-DD. */
  fecha: string;
  /** Ventas web pagadas ese día, con el flete cobrado. */
  ingresoWeb: number;
  /** Ventas del POS ese día. */
  ingresoPos: number;
  /** Lo que costaron las prendas vendidas ese día, a su costo de compra. */
  costoPrendas: number;
  /** Lo que cobró Starken por despachar las ventas de ese día; 0 mientras no se despachan. */
  despacho: number;
  /** Comisiones de los medios de pago de las ventas de ese día. */
  comisiones: number;
  /** Prendas dadas de baja ese día, a su costo de compra. */
  mermas: number;
}
