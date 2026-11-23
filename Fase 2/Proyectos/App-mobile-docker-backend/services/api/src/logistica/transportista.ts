import { Injectable } from '@nestjs/common';
import type { EventoSeguimiento, EstadoSeguimiento } from '@rockstar/contracts';

import { noEncontrado } from '../comun/errores.js';

/** Token de inyección del transportista: el resto del sistema no conoce la API de Starken. */
export const TRANSPORTISTA = Symbol('TRANSPORTISTA');

export type ZonaTarifaria = 'SANTIAGO' | 'REGIONES';

/** Destino y tamaño del carrito para el que se pide el valor del flete. */
export interface DestinoDeFlete {
  comuna: string;
  region: string;
  zona: ZonaTarifaria;
  /** Código de la comuna en Starken; puede faltar en datos antiguos. */
  codigoStarken: string | null;
  pesoGramos: number;
  volumenCm3: number;
  /** Tramo (1 = mínimo) calculado con la configuración, para tarifas y caché. */
  tramoPeso: number;
  tramoVolumen: number;
}

/** Lo que el transportista necesita para emitir una orden de despacho. */
export interface OrdenDeDespacho {
  /** Número del pedido. Viaja como referencia: emitir dos veces la misma no crea dos órdenes. */
  referencia: number;
  /** Clave estable por pedido; un reintento con la misma clave no duplica la orden. */
  idempotencia: string;
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

export interface SeguimientoTransportista {
  codigo: string;
  estado: EstadoSeguimiento;
  eventos: EventoSeguimiento[];
}

export interface Transportista {
  /** Si hace envíos. Uno desactivado no cobra flete y no emite despachos. */
  readonly activo: boolean;
  /** Valor del despacho a ese destino, en pesos. */
  cotizar(destino: DestinoDeFlete): Promise<number>;
  emitirDespacho(orden: OrdenDeDespacho): Promise<DespachoEmitido>;
  /** Estado del envío a la fecha; `despachadoEn` permite al doble derivar eventos sin red. */
  consultarSeguimiento(codigo: string, despachadoEn: Date): Promise<SeguimientoTransportista>;
}

/** Tarifas del doble de Starken: las mismas que la tienda mostraba antes de conectarse al backend. */
const TARIFA_SIMULADA: Readonly<Record<ZonaTarifaria, number>> = { SANTIAGO: 3990, REGIONES: 7990 };
const RECARGO_PESO = 500;
const RECARGO_VOLUMEN = 300;

/** Base de los códigos simulados: tienen la misma forma que los de los datos de demostración. */
const BASE_SEGUIMIENTO = 900_000;

const HORA_MS = 3_600_000;

/** Hitos del seguimiento simulado, medidos desde que salió el pedido. */
const HITOS: readonly { estado: EstadoSeguimiento; descripcion: string; horas: number }[] = [
  { estado: 'PREPARADO', descripcion: 'El envío está siendo preparado', horas: 0 },
  { estado: 'EN_TRANSITO', descripcion: 'El envío está en tránsito', horas: 6 },
  { estado: 'ENTREGADO', descripcion: 'El envío fue entregado', horas: 24 },
];

/**
 * Doble de Starken para desarrollar sin cuenta comercial. Tarifa fija por zona con recargo
 * por tramo, código de seguimiento propio de cada pedido y eventos que avanzan con el reloj.
 */
@Injectable()
export class StarkenSimulado implements Transportista {
  readonly activo = true;

  async cotizar(destino: DestinoDeFlete): Promise<number> {
    return (
      TARIFA_SIMULADA[destino.zona] +
      (destino.tramoPeso - 1) * RECARGO_PESO +
      (destino.tramoVolumen - 1) * RECARGO_VOLUMEN
    );
  }

  async emitirDespacho(orden: OrdenDeDespacho): Promise<DespachoEmitido> {
    return { seguimiento: `STK-${BASE_SEGUIMIENTO + orden.referencia}`, costo: orden.fleteCotizado };
  }

  async consultarSeguimiento(codigo: string, despachadoEn: Date): Promise<SeguimientoTransportista> {
    if (!/^STK-\d+$/.test(codigo)) {
      throw noEncontrado('El envío no existe.');
    }
    const horas = (Date.now() - despachadoEn.getTime()) / HORA_MS;
    const eventos = HITOS.filter((hito) => hito.horas === 0 || horas >= hito.horas).map((hito) => ({
      estado: hito.estado,
      descripcion: hito.descripcion,
      fecha: new Date(despachadoEn.getTime() + hito.horas * HORA_MS).toISOString(),
    }));
    return { codigo, estado: eventos[eventos.length - 1]!.estado, eventos };
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

  /** Sin envíos no hay seguimientos: cualquier código es desconocido. */
  async consultarSeguimiento(): Promise<SeguimientoTransportista> {
    throw noEncontrado('El envío no existe.');
  }
}
