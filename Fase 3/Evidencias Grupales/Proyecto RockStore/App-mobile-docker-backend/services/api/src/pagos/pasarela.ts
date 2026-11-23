import { randomInt, randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { RetornoPagoRequest } from '@rockstar/contracts';

import { ErrorDeNegocio } from '../comun/errores.js';
import type { ConfiguracionWebpay } from '../config.js';

/** Token de inyección de la pasarela de pago: el resto del sistema no conoce la API de Webpay. */
export const PASARELA = Symbol('PASARELA');

/** Medios con que se puede pagar en línea; coinciden con los códigos de `pagos.medios_pago`. */
export type MedioEnLinea = 'WEBPAY_DEBITO' | 'WEBPAY_CREDITO' | 'WEBPAY_PREPAGO';

export interface PagoResuelto {
  autorizado: boolean;
  medio: MedioEnLinea;
  codigoAutorizacion?: string;
  motivoRechazo?: string;
}

export interface Pasarela {
  /**
   * Formulario de pago al que se envía al comprador con el token, o `null` si la pasarela no
   * tiene uno (la simulada: el resultado se elige en la tienda).
   */
  readonly urlFormulario: string | null;
  /**
   * Abre un pago por ese monto y entrega el token que lo identifica. `origen` es la dirección
   * de la tienda desde la que se compra: allí vuelve el comprador al terminar.
   */
  crear(pago: { idVenta: number; monto: number; origen?: string }): Promise<{ token: string }>;
  /** Pregunta cómo terminó el pago cuando el comprador vuelve de la pasarela. */
  confirmar(token: string, retorno: Partial<RetornoPagoRequest>): Promise<PagoResuelto>;
}

/** Ruta de la API a la que Webpay devuelve al comprador (ver `VentasController.vuelta`). */
export const RUTA_VUELTA = '/api/v1/pagos/webpay/vuelta';

/**
 * Doble de Webpay para desarrollar sin credenciales de Transbank. No cobra nada: el
 * resultado lo elige quien prueba, en la pantalla de pago simulado de la tienda. Nunca
 * recibe ni guarda datos de tarjeta.
 */
@Injectable()
export class PasarelaSimulada implements Pasarela {
  readonly urlFormulario = null;

  async crear(): Promise<{ token: string }> {
    return { token: `SIM-${randomUUID()}` };
  }

  async confirmar(_token: string, retorno: Partial<RetornoPagoRequest>): Promise<PagoResuelto> {
    if (retorno.anulado) {
      return { autorizado: false, medio: 'WEBPAY_DEBITO', motivoRechazo: 'Anulaste el pago.' };
    }
    if (retorno.aprobar === false) {
      return { autorizado: false, medio: 'WEBPAY_DEBITO', motivoRechazo: 'Pago rechazado por el banco (simulado).' };
    }
    return { autorizado: true, medio: 'WEBPAY_DEBITO', codigoAutorizacion: String(randomInt(100_000, 1_000_000)) };
  }
}

const SERVIDORES = {
  integracion: 'https://webpay3gint.transbank.cl',
  produccion: 'https://webpay3g.transbank.cl',
} as const;
const API_TRANSACCIONES = '/rswebpaytransaction/api/webpay/v1.2/transactions';
const MS_ESPERA = 20_000;

/** Respuesta de Webpay al confirmar o consultar una transacción (los campos que se usan). */
interface TransaccionWebpay {
  status?: string;
  response_code?: number;
  authorization_code?: string;
  payment_type_code?: string;
}

/**
 * Webpay Plus de Transbank, por su API REST. El comprador paga en el formulario de Webpay:
 * la tienda nunca ve la tarjeta. En `integracion` es el ambiente de prueba de Transbank, que
 * acepta solo tarjetas de prueba y no mueve dinero.
 */
export class PasarelaWebpay implements Pasarela {
  private readonly log = new Logger('Webpay');
  private readonly servidor: string;
  readonly urlFormulario: string;

  constructor(private readonly config: Extract<ConfiguracionWebpay, { codigoComercio: string }>) {
    this.servidor = SERVIDORES[config.ambiente];
    this.urlFormulario = `${this.servidor}/webpayserver/initTransaction`;
  }

  async crear({ idVenta, monto, origen }: { idVenta: number; monto: number; origen?: string }): Promise<{ token: string }> {
    const urlRetorno = this.config.urlRetorno ?? (origen ? `${origen}${RUTA_VUELTA}` : null);
    if (!urlRetorno) {
      throw new ErrorDeNegocio(400, 'DATOS_INVALIDOS', 'No se sabe a qué dirección volver después de pagar.');
    }
    // La orden de compra debe ser única en Webpay aunque la base se reinicie y repita números de venta.
    const ordenDeCompra = `RS${idVenta}-${Date.now().toString(36)}`;
    const respuesta = await this.llamar<{ token: string }>('POST', API_TRANSACCIONES, {
      buy_order: ordenDeCompra,
      session_id: `venta-${idVenta}`,
      amount: monto,
      return_url: urlRetorno,
    }).catch((error) => {
      throw error instanceof RechazoWebpay ? this.noDisponible('Webpay no aceptó iniciar el pago. Inténtalo de nuevo más tarde.') : error;
    });
    if (!respuesta?.token) {
      throw this.noDisponible('Webpay no entregó el token del pago.');
    }
    return { token: respuesta.token };
  }

  async confirmar(token: string, retorno: Partial<RetornoPagoRequest>): Promise<PagoResuelto> {
    if (retorno.anulado) {
      // Transbank indica no confirmar un pago anulado: no hubo cobro.
      return { autorizado: false, medio: 'WEBPAY_DEBITO', motivoRechazo: 'Anulaste el pago en Webpay. No se hizo ningún cobro.' };
    }
    let transaccion: TransaccionWebpay | null;
    try {
      transaccion = await this.llamar<TransaccionWebpay>('PUT', `${API_TRANSACCIONES}/${encodeURIComponent(token)}`);
    } catch (error) {
      if (!(error instanceof RechazoWebpay)) throw error;
      // No se pudo confirmar (por ejemplo, ya estaba confirmado o el formulario venció):
      // se consulta cómo quedó, para no perder un pago que sí se hizo.
      transaccion = await this.llamar<TransaccionWebpay>('GET', `${API_TRANSACCIONES}/${encodeURIComponent(token)}`).catch((otro) => {
        if (otro instanceof RechazoWebpay) return null;
        throw otro;
      });
    }
    const medio = medioDe(transaccion?.payment_type_code);
    if (transaccion?.status === 'AUTHORIZED' && transaccion.response_code === 0) {
      return { autorizado: true, medio, ...(transaccion.authorization_code ? { codigoAutorizacion: transaccion.authorization_code } : {}) };
    }
    return { autorizado: false, medio, motivoRechazo: 'El banco rechazó el pago. No se hizo ningún cobro.' };
  }

  private async llamar<T>(metodo: 'POST' | 'PUT' | 'GET', ruta: string, cuerpo?: unknown): Promise<T | null> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.servidor}${ruta}`, {
        method: metodo,
        headers: {
          'Tbk-Api-Key-Id': this.config.codigoComercio,
          'Tbk-Api-Key-Secret': this.config.llaveSecreta,
          'Content-Type': 'application/json',
        },
        ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
        signal: AbortSignal.timeout(MS_ESPERA),
      });
    } catch (error) {
      this.log.error(`${metodo} ${ruta}: ${error instanceof Error ? error.message : String(error)}`);
      throw this.noDisponible('No se pudo conectar con Webpay. Inténtalo de nuevo en unos minutos.');
    }
    const texto = await respuesta.text();
    if (respuesta.status >= 500) {
      this.log.error(`${metodo} ${ruta}: ${respuesta.status} ${texto}`);
      throw this.noDisponible('Webpay no está respondiendo. Inténtalo de nuevo en unos minutos.');
    }
    if (!respuesta.ok) {
      this.log.warn(`${metodo} ${ruta}: ${respuesta.status} ${texto}`);
      throw new RechazoWebpay(respuesta.status, texto);
    }
    return texto ? (JSON.parse(texto) as T) : null;
  }

  private noDisponible(mensaje: string): ErrorDeNegocio {
    return new ErrorDeNegocio(502, 'PASARELA_NO_DISPONIBLE', mensaje);
  }
}

/** Webpay rechazó la llamada (4xx): datos inválidos, token vencido o ya usado. */
class RechazoWebpay extends Error {
  constructor(
    readonly status: number,
    readonly detalle: string,
  ) {
    super(`Webpay respondió ${status}`);
  }
}

/** VD es débito y VP prepago; el resto de los códigos de Webpay son formas de pago con crédito. */
function medioDe(tipo: string | undefined): MedioEnLinea {
  if (tipo === 'VD') return 'WEBPAY_DEBITO';
  if (tipo === 'VP') return 'WEBPAY_PREPAGO';
  return tipo ? 'WEBPAY_CREDITO' : 'WEBPAY_DEBITO';
}
