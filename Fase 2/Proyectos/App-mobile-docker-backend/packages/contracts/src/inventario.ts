export type Ubicacion = 'BODEGA' | 'SALA_VENTAS';

export type TipoMovimiento =
  | 'INGRESO'
  | 'VENTA'
  | 'DEVOLUCION'
  | 'DESPACHO'
  | 'MERMA'
  | 'TRASPASO'
  | 'AJUSTE';

export type TipoMerma = 'DANADO' | 'MUESTRA' | 'CAMBIO';

export interface Existencia {
  ubicacion: Ubicacion;
  cantidad: number;
}

/** Variante con su stock, tal como la ven Vendedor, Bodega y Gerente. */
export interface VarianteStock {
  idVariante: number;
  sku: string;
  codigo: string;
  producto: string;
  /** Categoría del producto, por ejemplo "Poleras" o "Cinturones". */
  categoria: string;
  /** Banda a la que pertenece el producto; `null` en prendas que no son de una banda. */
  banda: string | null;
  /** URL de la foto del producto; `null` si aún no tiene. */
  imagenUrl: string | null;
  /** Posición del producto en la bodega, por ejemplo "B-POL-03". La genera el servicio. */
  codigoUbicacion: string;
  talla: string;
  color: string;
  activo: boolean;
  existencias: Existencia[];
  reservado: number;
  /** Suma de existencias menos unidades reservadas. */
  disponible: number;
}

export interface Movimiento {
  idMovimiento: number;
  idVariante: number;
  tipo: TipoMovimiento;
  tipoMerma?: TipoMerma;
  ubicacion: Ubicacion;
  ubicacionDestino?: Ubicacion;
  /** Unidades movidas; en un ajuste es la diferencia aplicada (puede ser negativa). */
  cantidad: number;
  fecha: string;
  idUsuario: number;
  motivo: string;
}

/** Respuesta de toda operación que registra movimientos. */
export interface ResultadoMovimientos {
  movimientos: Movimiento[];
  variantes: VarianteStock[];
}

interface OperacionIdempotente {
  /** UUID generado por el cliente; reenviar la misma clave no duplica la operación. */
  claveIdempotencia: string;
}

/**
 * Categoría de productos con los datos que le son propios. GET /inventario/categorias
 *
 * Cada categoría define qué tallas admite (los pantalones van de 38 a 50; las poleras de
 * XS a XXL) y si sus productos pertenecen a una banda. Los clientes usan esto para mostrar
 * solo los campos y filtros que corresponden a la categoría elegida.
 */
export interface Categoria {
  nombre: string;
  tallas: string[];
  usaBanda: boolean;
}

/**
 * POST /inventario/bandas, /inventario/categorias y /inventario/colores
 *
 * Registra una banda, categoría o color sin necesidad de crear un producto. Estas rutas,
 * y sus GET, responden la lista completa en orden alfabético: nombres en bandas y colores,
 * y `Categoria[]` en categorías. Registrar un nombre que ya existe no es un error: se
 * conserva el existente. Una categoría nueva nace con tallas XS a XXL y admite banda.
 */
export interface NombreRequest {
  nombre: string;
}

/**
 * POST /inventario/productos
 *
 * Crea un producto con una variante y registra el ingreso de sus primeras unidades, todo
 * en una sola operación. El servicio genera el SKU, el código escaneable y el código de
 * ubicación, y responde la variante creada con su stock. Si el producto ya existe,
 * agrega la variante de talla y color a ese producto.
 */
export interface ProductoNuevoRequest extends OperacionIdempotente {
  nombre: string;
  categoria: string;
  banda: string | null;
  talla: string;
  color: string;
  /** Unidades recibidas; entero mayor que cero. Quedan registradas como un movimiento de ingreso. */
  cantidad: number;
  /** Ubicación donde ingresan esas unidades. */
  ubicacion: Ubicacion;
  /** Foto del producto como data URL (`data:image/...;base64,...`). */
  imagen: string;
}

/** POST /inventario/movimientos/ingresos */
export interface IngresoRequest extends OperacionIdempotente {
  ubicacion: Ubicacion;
  motivo?: string;
  lineas: { idVariante: number; cantidad: number }[];
}

/** POST /inventario/movimientos/mermas */
export interface MermaRequest extends OperacionIdempotente {
  idVariante: number;
  ubicacion: Ubicacion;
  cantidad: number;
  tipoMerma: TipoMerma;
  motivo: string;
}

/** POST /inventario/movimientos/traspasos */
export interface TraspasoRequest extends OperacionIdempotente {
  idVariante: number;
  origen: Ubicacion;
  destino: Ubicacion;
  cantidad: number;
  motivo: string;
}

/** POST /inventario/movimientos/ajustes */
export interface AjusteRequest extends OperacionIdempotente {
  idVariante: number;
  ubicacion: Ubicacion;
  cantidadContada: number;
  motivo: string;
}

/** POST /inventario/busquedas */
export interface BusquedaRequest {
  idVariante: number;
}

/** PATCH /inventario/busquedas/:id */
export interface CierreBusquedaRequest {
  resultado: 'ENCONTRADA' | 'CANCELADA';
}

export interface Busqueda {
  idBusqueda: number;
  idVariante: number;
  inicio: string;
  /** Solo presente cuando la búsqueda se completó con la prenda encontrada. */
  fin?: string;
  duracionSegundos?: number;
}

/**
 * Prenda a la venta en la tienda web. GET /inventario/catalogo (público)
 *
 * Solo aparecen las variantes activas de productos con precio. No expone ubicaciones
 * ni reservas: `disponible` es lo que un cliente puede comprar en este momento.
 */
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

/**
 * Variante con los datos comerciales de su producto, para administrarlo.
 * GET /inventario/productos (Vendedor, Bodega, Gerente)
 */
export interface VarianteGestion extends VarianteStock {
  idProducto: number;
  /** `null` mientras el Gerente no lo define; sin precio el producto no se publica en la tienda. */
  precio: number | null;
  descripcion: string | null;
}

/**
 * PATCH /inventario/productos/:id (Gerente)
 *
 * Cambia los datos comerciales del producto. Solo se modifican los campos enviados.
 * Un precio `null` retira el producto de la tienda. Responde sus variantes.
 */
export interface ProductoEdicionRequest {
  precio?: number | null;
  descripcion?: string | null;
}

/** Banda tal como la muestra la tienda. GET /inventario/catalogo/bandas (público) */
export interface BandaCatalogo {
  idBanda: number;
  nombre: string;
  /** Dirección de la foto de la banda, que entrega el backend; `null` si aún no tiene. */
  imagenUrl: string | null;
  /** Autor y licencia de la foto, para mostrarlos junto a ella. */
  credito: string | null;
}

/**
 * PUT /inventario/bandas/imagen (Bodega, Gerente)
 *
 * Guarda la foto de una banda, reemplazando la anterior. Si la banda no existe, la
 * registra. Admite JPEG, PNG y WebP de hasta 2 MB. Responde la banda.
 */
export interface ImagenBandaRequest {
  banda: string;
  /** Foto como data URL (`data:image/jpeg;base64,...`). */
  imagen: string;
  credito?: string | null;
}

/**
 * PATCH /inventario/variantes/:id (Bodega, Gerente)
 *
 * Edita una prenda. Solo cambian los campos enviados. La talla y el color son de la
 * variante; el nombre, la categoría, la banda y la foto son de su producto, así que
 * cambian para todas sus tallas y colores. Responde la variante como quedó.
 *
 * - Un nombre que ya tiene otro producto responde `409 PRODUCTO_DUPLICADO`.
 * - Una talla y color que el producto ya tiene responde `409 VARIANTE_DUPLICADA`.
 * - Al cambiar de categoría el producto recibe un espacio nuevo en la zona de esa
 *   categoría, y pierde la banda si la categoría no usa bandas.
 * - El stock no se edita aquí: cambia con ingresos, mermas, traspasos y conteos.
 */
export interface VarianteEdicionRequest {
  nombre?: string;
  categoria?: string;
  /** `null` o vacío deja el producto sin banda. */
  banda?: string | null;
  talla?: string;
  color?: string;
  /** Foto nueva como data URL (`data:image/...;base64,...`). */
  imagen?: string;
}
