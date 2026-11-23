export type EstadoPedido =
  | 'PAGADO'
  | 'EN_PREPARACION'
  | 'DESPACHO_PENDIENTE'
  | 'ATENCION_MANUAL'
  | 'DESPACHADO'
  | 'ENTREGADO';

export interface LineaPedido {
  idVariante: number;
  sku: string;
  producto: string;
  talla: string;
  color: string;
  cantidad: number;
}

/** Pedido del e-commerce tal como lo ve el personal. GET /logistica/pedidos */
export interface Pedido {
  idPedido: number;
  idVenta: number;
  estado: EstadoPedido;
  destinatario: string;
  direccion: string;
  comuna: string;
  region: string;
  lineas: LineaPedido[];
  pagadoEn: string;
  despachadoEn?: string;
  entregadoEn?: string;
  /** Número de seguimiento de Starken; existe desde que se emite el despacho. */
  trackingStarken?: string;
  /** Último estado informado por el transportista, más detallado que el estado del pedido. */
  seguimientoEstado?: EstadoSeguimiento;
}

/** GET /logistica/regiones (público) */
export interface Region {
  idRegion: number;
  nombre: string;
}

/** GET /logistica/comunas?region= (público) */
export interface Comuna {
  idComuna: number;
  nombre: string;
}

/** Línea del carrito que interesa al flete: basta la variante y cuántas unidades se llevan. */
export interface LineaCotizacion {
  idVariante: number;
  cantidad: number;
}

/** POST /logistica/fletes/cotizar (público) */
export interface CotizacionFleteRequest {
  idComuna: number;
  /** Opcional para clientes antiguos: sin líneas se cotiza el tramo mínimo. */
  lineas?: LineaCotizacion[];
}

export interface CotizacionFlete {
  idComuna: number;
  /** Costo del despacho a esa comuna, en pesos. */
  valor: number;
  /** `false` cuando los envíos están desactivados: el flete vale cero y el pedido no se despacha. */
  disponible: boolean;
}

/** Estados que informa el transportista sobre un envío. */
export type EstadoSeguimiento = 'PREPARADO' | 'EN_TRANSITO' | 'ENTREGADO';

export interface EventoSeguimiento {
  estado: EstadoSeguimiento;
  descripcion: string;
  /** ISO 8601 con zona horaria. */
  fecha: string;
}

/** GET /logistica/envios/:seguimiento */
export interface SeguimientoEnvio {
  codigo: string;
  estado: EstadoSeguimiento;
  eventos: EventoSeguimiento[];
  actualizadoEn: string;
}

export interface LineaPedidoCliente extends LineaPedido {
  precioUnitario: number;
}

/** Pedido tal como lo ve quien lo compró. GET /logistica/pedidos/mios (Cliente) */
export interface PedidoCliente extends Omit<Pedido, 'lineas'> {
  lineas: LineaPedidoCliente[];
  flete: number;
  /** Lo pagado: productos más flete. */
  total: number;
}
