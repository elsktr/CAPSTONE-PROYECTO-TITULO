import { Injectable } from '@nestjs/common';

/** Token de inyección del transportista: el resto del sistema no conoce la API de Starken. */
export const TRANSPORTISTA = Symbol('TRANSPORTISTA');

export type ZonaTarifaria = 'SANTIAGO' | 'REGIONES';

/** Destino para el que se pide el valor del flete. */
export interface DestinoDeFlete {
  comuna: string;
  region: string;
  zona: ZonaTarifaria;
}

/** Lo que el transportista necesita para emitir una orden de despacho. */
export interface OrdenDeDespacho {
  /** Número del pedido. Viaja como referencia: emitir dos veces la misma no crea dos órdenes. */
  referencia: number;
  destinatario: string;
  direccion: string;
  comuna: string;
  region: string;
  telefono: string | null;
  /** Flete que se le cotizó y cobró al cliente por este despacho, en pesos. */
  fleteCotizado: number;
}

export interface DespachoEmitido {
  /** Código de seguimiento con que el cliente consulta su envío. */
  seguimiento: string;
  /** Lo que el transportista cobra a la tienda por el despacho, en pesos. */
  costo: number;
}

export interface Transportista {
  /** Si hace envíos. Uno desactivado no cobra flete y no emite despachos. */
  readonly activo: boolean;
  /** Valor del despacho a ese destino, en pesos. */
  cotizar(destino: DestinoDeFlete): Promise<number>;
  emitirDespacho(orden: OrdenDeDespacho): Promise<DespachoEmitido>;
}

/** Tarifas del doble de Starken: las mismas que la tienda mostraba antes de conectarse al backend. */
const TARIFA_SIMULADA: Readonly<Record<ZonaTarifaria, number>> = { SANTIAGO: 3990, REGIONES: 7990 };

/** Base de los códigos simulados: tienen la misma forma que los de los datos de demostración. */
const BASE_SEGUIMIENTO = 900_000;

/**
 * Doble de Starken para desarrollar sin cuenta comercial. Cotiza una tarifa fija por
 * zona, entrega un código de seguimiento propio de cada pedido, siempre el mismo para
 * la misma referencia, y cobra a la tienda lo mismo que se le cotizó al cliente.
 */
@Injectable()
export class StarkenSimulado implements Transportista {
  readonly activo = true;

  async cotizar(destino: DestinoDeFlete): Promise<number> {
    return TARIFA_SIMULADA[destino.zona];
  }

  async emitirDespacho(orden: OrdenDeDespacho): Promise<DespachoEmitido> {
    return { seguimiento: `STK-${BASE_SEGUIMIENTO + orden.referencia}`, costo: orden.fleteCotizado };
  }
}

/**
 * Envíos apagados, para publicar la tienda mientras no haya cuenta con Starken: el flete
 * vale cero y ningún pedido se despacha. `DespachosService` no llega a pedirle una orden.
 */
@Injectable()
export class StarkenDesactivado implements Transportista {
  readonly activo = false;

  async cotizar(): Promise<number> {
    return 0;
  }

  async emitirDespacho(): Promise<DespachoEmitido> {
    throw new Error('Los envíos están desactivados.');
  }
}
