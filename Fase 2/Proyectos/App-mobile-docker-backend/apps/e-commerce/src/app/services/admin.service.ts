import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  CuentaInterna,
  IngresoRequest,
  MermaRequest,
  Movimiento,
  Pedido,
  ProductoEdicionRequest,
  Ubicacion,
  VarianteGestion,
} from '@rockstar/contracts';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../core/api';
import { PLACEHOLDER_IMAGE } from '../data/models';

/** Fila de la tabla de bodega: una variante con su stock físico y los datos comerciales de su producto. */
export interface StockRow {
  id: number;
  productId: number;
  sku: string;
  name: string;
  category: string;
  size: string;
  color: string;
  /** `null` mientras el Gerente no define el precio; sin precio no se publica en la tienda. */
  price: number | null;
  description: string;
  image: string;
  location: string;
  active: boolean;
  warehouse: number;
  salesFloor: number;
  /** Unidades físicas: bodega más sala de ventas. */
  stock: number;
  reserved: number;
  available: number;
}

function toRow(variante: VarianteGestion): StockRow {
  const units = (ubicacion: Ubicacion) => variante.existencias.find((e) => e.ubicacion === ubicacion)?.cantidad ?? 0;
  return {
    id: variante.idVariante,
    productId: variante.idProducto,
    sku: variante.sku,
    name: variante.producto,
    category: variante.categoria,
    size: variante.talla,
    color: variante.color,
    price: variante.precio,
    description: variante.descripcion ?? '',
    image: variante.imagenUrl ?? PLACEHOLDER_IMAGE,
    location: variante.codigoUbicacion,
    active: variante.activo,
    warehouse: units('BODEGA'),
    salesFloor: units('SALA_VENTAS'),
    stock: units('BODEGA') + units('SALA_VENTAS'),
    reserved: variante.reservado,
    available: variante.disponible,
  };
}

/**
 * Datos del personal: inventario completo, mermas, pedidos y cuentas internas, y las
 * operaciones de bodega. El backend decide qué puede hacer cada rol.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  readonly inventory = signal<StockRow[]>([]);
  readonly losses = signal<Movimiento[]>([]);
  readonly orders = signal<Pedido[]>([]);
  readonly staff = signal<CuentaInterna[]>([]);

  readonly totalUnits = computed(() => this.inventory().reduce((sum, p) => sum + p.stock, 0));
  readonly lowStockCount = computed(() => this.inventory().filter((p) => p.active && p.stock <= 3).length);
  readonly locationsCount = computed(() => new Set(this.inventory().map((p) => p.location)).size);
  readonly unpricedCount = computed(() => new Set(this.inventory().filter((p) => p.price === null).map((p) => p.productId)).size);

  /** Valor de venta del stock físico de los productos que ya tienen precio. */
  readonly projectedSales = computed(() => this.inventory().reduce((sum, p) => sum + (p.price ?? 0) * p.stock, 0));

  /** Valor de venta de las unidades dadas de baja como merma, al precio actual de cada producto. */
  readonly lossValue = computed(() => {
    const prices = new Map(this.inventory().map((p) => [p.id, p.price ?? 0]));
    return this.losses().reduce((sum, m) => sum + m.cantidad * (prices.get(m.idVariante) ?? 0), 0);
  });

  readonly efficiency = computed(() => {
    const projected = this.projectedSales();
    const base = projected + this.lossValue();
    return base ? (projected / base) * 100 : 100;
  });

  /** Porcentaje de variantes activas con unidades disponibles para vender. */
  readonly availability = computed(() => {
    const active = this.inventory().filter((p) => p.active);
    return active.length ? (active.filter((p) => p.available > 0).length / active.length) * 100 : 0;
  });

  /** Porcentaje de pedidos pagados que ya salieron de la tienda. */
  readonly fulfilment = computed(() => {
    const orders = this.orders();
    const shipped = orders.filter((o) => o.estado === 'DESPACHADO' || o.estado === 'ENTREGADO').length;
    return orders.length ? (shipped / orders.length) * 100 : 100;
  });

  async loadInventory(): Promise<void> {
    const variantes = await firstValueFrom(this.http.get<VarianteGestion[]>(`${API_URL}/inventario/productos`));
    this.inventory.set(variantes.map(toRow));
  }

  /** Lo que muestra la vista de finanzas, que es del Gerente. */
  async loadFinance(): Promise<void> {
    const [, losses, orders, staff] = await Promise.all([
      this.loadInventory(),
      firstValueFrom(this.http.get<Movimiento[]>(`${API_URL}/inventario/movimientos`, { params: { tipo: 'MERMA' } })),
      firstValueFrom(this.http.get<Pedido[]>(`${API_URL}/logistica/pedidos`)),
      firstValueFrom(this.http.get<CuentaInterna[]>(`${API_URL}/usuarios/internos`)),
    ]);
    this.losses.set(losses);
    this.orders.set(orders);
    this.staff.set(staff);
  }

  /** Ingreso de unidades a la bodega. `key` identifica la operación: reintentarla no la duplica. */
  async addStock(key: string, variantId: number, amount: number): Promise<void> {
    const body: IngresoRequest = {
      claveIdempotencia: key,
      ubicacion: 'BODEGA',
      motivo: 'Ingreso desde el panel de la tienda',
      lineas: [{ idVariante: variantId, cantidad: amount }],
    };
    await firstValueFrom(this.http.post(`${API_URL}/inventario/movimientos/ingresos`, body));
    await this.loadInventory();
  }

  async registerDamage(key: string, variantId: number, location: Ubicacion, amount: number, reason: string): Promise<void> {
    const body: MermaRequest = {
      claveIdempotencia: key,
      idVariante: variantId,
      ubicacion: location,
      cantidad: amount,
      tipoMerma: 'DANADO',
      motivo: reason,
    };
    await firstValueFrom(this.http.post(`${API_URL}/inventario/movimientos/mermas`, body));
    await this.loadInventory();
  }

  /** Cambia el precio y la descripción del producto; aplica a todas sus tallas. */
  async updateProduct(productId: number, changes: ProductoEdicionRequest): Promise<void> {
    await firstValueFrom(this.http.patch(`${API_URL}/inventario/productos/${productId}`, changes));
    await this.loadInventory();
  }
}
