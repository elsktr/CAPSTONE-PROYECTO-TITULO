import { Injectable, inject, signal } from '@angular/core';
import type { Comuna } from '@rockstar/contracts';

import { errorCode, errorMessage } from '../core/api';
import { CartService } from './cart.service';
import { ShopApi } from './shop.api';

/** Códigos que significan que el transportista no tiene cobertura para esa comuna. */
const CODIGO_SIN_COBERTURA = ['SIN_COBERTURA', 'TRANSPORTISTA_NO_DISPONIBLE'];

/**
 * Simulación del envío del carrito antes de comprar: elige un destino con el contenido
 * actual y muestra el costo que el backend devolvería, sin afectar la compra ni el
 * despacho. El usuario solo la ve; "Usar este destino" es lo que lo cambia.
 */
@Injectable({ providedIn: 'root' })
export class SimulacionEnvioService {
  private readonly api = inject(ShopApi);
  private readonly cart = inject(CartService);

  /** Región y comuna simuladas; los selects de la pestaña las modifican. */
  readonly region = signal<number | null>(null);
  readonly comuna = signal<number | null>(null);
  readonly comunas = signal<Comuna[]>([]);
  /** Costo estimado del envío a la comuna simulada. */
  readonly costo = signal<number | null>(null);
  readonly ocupada = signal(false);
  readonly error = signal<string | null>(null);
  /** El transportista no tiene cobertura para la comuna simulada. */
  readonly sinCobertura = signal(false);

  private readonly lineas = () => this.cart.items().map((item) => ({ idVariante: item.id, cantidad: item.qty }));

  /** Se puede usar la simulación: hay comuna elegida y el carrito no está cotizando. */
  readonly puedeUsar = () => this.comuna() !== null && !this.ocupada();

  /** "Usar este destino": copia la comuna simulada a los datos de despacho, sin tocar el resto. */
  usarDestino(): void {
    const comunaId = this.comuna();
    if (comunaId === null) return;
    this.cart.setShipping({ regionId: this.region(), comunaId });
    // La cotización real del carrito responde con el flete que se cobrará.
    this.cart.quote();
  }

  /** Cambia la región simulada: carga sus comunas y despeja la cotización anterior. */
  async cambiarRegion(regionId: number | null): Promise<void> {
    this.region.set(regionId);
    this.comuna.set(null);
    this.comunas.set([]);
    this.costo.set(null);
    this.sinCobertura.set(false);
    this.error.set(null);
    if (regionId === null) return;
    try {
      this.comunas.set(await this.api.comunas(regionId));
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  /** Cambia la comuna simulada: vuelve a cotizar para el contenido actual del carrito. */
  async cambiarComuna(comunaId: number | null): Promise<void> {
    this.comuna.set(comunaId);
    if (comunaId === null) {
      this.costo.set(null);
      return;
    }
    await this.cotizar();
  }

  /** Vuelve a cotizar la comuna simulada; un error diferente se puede reintentar. */
  async cotizar(): Promise<void> {
    const comunaId = this.comuna();
    if (comunaId === null || this.ocupada()) return;
    this.costo.set(null);
    this.sinCobertura.set(false);
    this.error.set(null);
    this.ocupada.set(true);
    try {
      const { valor } = await this.api.quote(comunaId, this.lineas());
      if (this.comuna() === comunaId) {
        this.costo.set(valor);
      }
    } catch (e) {
      const sinCobertura = CODIGO_SIN_COBERTURA.includes(errorCode(e) ?? '');
      this.sinCobertura.set(sinCobertura);
      this.error.set(sinCobertura ? null : errorMessage(e));
    } finally {
      this.ocupada.set(false);
    }
  }

  /** Reintenta la cotización: el usuario vuelve a intentar después de un error. */
  reintentar(): Promise<void> {
    return this.cotizar();
  }
}
