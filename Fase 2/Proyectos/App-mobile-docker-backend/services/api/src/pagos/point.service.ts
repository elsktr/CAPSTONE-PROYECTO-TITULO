import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CobroPointRequest, CobroTerminal, EstadoCobroTerminal, ModoTerminal, TerminalPoint } from '@rockstar/contracts';

import { ErrorDeNegocio, cuerpoComo, esEnteroPositivo, exigir } from '../comun/errores.js';
import { CONFIGURACION, type Configuracion } from '../config.js';

const MS_ESPERA = 15_000;
/** Plazo para pagar en la máquina; después la orden expira y hay que cobrar de nuevo. */
const PLAZO_PAGO = 'PT5M';

/**
 * Lo que significa cada resultado de una máquina Point (`status_detail` del pago en la API
 * de Órdenes de Mercado Pago), dicho para el vendedor.
 */
export const MOTIVOS_POINT: Readonly<Record<string, string>> = {
  accredited: 'Pago aprobado.',
  failed: 'El pago no se pudo completar.',
  bad_filled_card_data: 'Datos de la tarjeta mal ingresados (número, código de seguridad o vencimiento).',
  high_risk: 'Rechazado por prevención de fraude.',
  rejected_by_issuer: 'El banco emisor rechazó la tarjeta.',
  rejected_other_reason: 'El banco emisor rechazó el pago.',
  required_call_for_authorize: 'El banco pide que el cliente llame para autorizar el pago.',
  max_attempts_exceeded: 'Se superó el número de intentos permitidos con esta tarjeta.',
  card_disabled: 'La tarjeta está bloqueada o inhabilitada.',
  insufficient_amount: 'Fondos insuficientes.',
  amount_limit_exceeded: 'El monto supera el límite de la tarjeta.',
  processing_error: 'Error al procesar el pago en la máquina.',
  invalid_installments: 'La tarjeta no acepta ese número de cuotas.',
  in_review: 'El pago quedó en revisión.',
  canceled_on_terminal: 'Se canceló en la máquina.',
  canceled_by_api: 'Se canceló desde la caja.',
  canceled: 'Cobro cancelado.',
  expired: 'Se acabó el tiempo para pagar en la máquina.',
  check_on_terminal: 'La máquina no informó el resultado: revísalo en su pantalla antes de cobrar de nuevo.',
  action_required: 'La máquina no informó el resultado: revísalo en su pantalla antes de cobrar de nuevo.',
  refunded: 'Pago devuelto al cliente.',
};

/** Orden de la API de Órdenes de Mercado Pago, con lo que usa el POS. */
interface OrdenPoint {
  id: string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  config?: { payment_method?: { default_type?: string } };
  transactions?: {
    payments?: {
      id?: string;
      amount?: string;
      status?: string;
      status_detail?: string;
      reference_id?: string;
      payment_method?: { type?: string };
      card?: { last_digits?: string };
    }[];
  };
}

/** Lo que el POS ve de una orden: estado, motivo y, si se pagó, el pago y la tarjeta. */
export function cobroDeOrden(orden: OrdenPoint): CobroTerminal {
  const pago = orden.transactions?.payments?.[0];
  const estado = estadoDe(orden.status);
  // El detalle del pago dice por qué falló o cómo se canceló; el de la orden es más general.
  const codigo = pago?.status_detail || orden.status_detail || orden.status;
  const digitos = pago?.card?.last_digits?.match(/(\d{4})$/)?.[1];
  const tipoPago = pago?.payment_method?.type ?? orden.config?.payment_method?.default_type;
  return {
    id: orden.id,
    monto: Math.round(Number(pago?.amount ?? 0)),
    tipo: tipoPago === 'credit_card' ? 'CREDITO' : 'DEBITO',
    referencia: orden.external_reference ?? null,
    estado,
    codigoAutorizacion: estado === 'APROBADO' || estado === 'ANULADO' ? (pago?.reference_id ?? pago?.id ?? null) : null,
    tarjeta: digitos ? `•••• ${digitos}` : null,
    motivo: estado === 'PENDIENTE' ? null : (MOTIVOS_POINT[codigo] ?? `Mercado Pago informó ${codigo}.`),
    codigo: estado === 'PENDIENTE' ? null : codigo,
  };
}

function estadoDe(status: string): EstadoCobroTerminal {
  switch (status) {
    case 'created':
    case 'at_terminal':
      return 'PENDIENTE';
    case 'processed':
      return 'APROBADO';
    case 'failed':
      return 'RECHAZADO';
    case 'canceled':
    case 'expired':
      return 'CANCELADO';
    case 'refunded':
      return 'ANULADO';
    default:
      // `action_required` y cualquier estado nuevo: que el vendedor lo mire en la máquina.
      return 'REVISAR';
  }
}

/**
 * Máquinas de cobro Mercado Pago Point por la API de Órdenes. El access token vive solo
 * aquí: el POS le pide a la API que cobre, consulte, cancele o anule.
 */
@Injectable()
export class PointService {
  private readonly log = new Logger('MercadoPagoPoint');

  constructor(@Inject(CONFIGURACION) private readonly configuracion: Configuracion) {}

  async terminales(): Promise<TerminalPoint[]> {
    const respuesta = await this.llamar<{ data?: { terminals?: { id: string; operating_mode: ModoTerminal }[] } }>(
      'GET',
      '/terminals/v1/list?limit=50',
    );
    return (respuesta?.data?.terminals ?? []).map((t) => ({ id: t.id, modo: t.operating_mode }));
  }

  /** Deja la máquina en modo PDV, el que recibe los cobros desde la caja. */
  async activar(idTerminal: string): Promise<TerminalPoint> {
    exigir(esIdTerminal(idTerminal), 'La máquina no es válida.');
    await this.llamar('PATCH', '/terminals/v1/setup', { terminals: [{ id: idTerminal, operating_mode: 'PDV' }] });
    return { id: idTerminal, modo: 'PDV' };
  }

  async cobrar(cuerpo: unknown): Promise<CobroTerminal> {
    const { terminal, monto, tipo, referencia } = cuerpoComo<CobroPointRequest>(cuerpo);
    exigir(typeof terminal === 'string' && esIdTerminal(terminal), 'La máquina no es válida.');
    exigir(esEnteroPositivo(monto), 'El monto debe ser un entero mayor que cero.');
    exigir(tipo === 'DEBITO' || tipo === 'CREDITO', 'El tipo de tarjeta debe ser DEBITO o CREDITO.');
    exigir(typeof referencia === 'string' && referencia.trim() !== '', 'Falta la referencia de la venta.');
    // Mercado Pago no acepta dos órdenes con la misma referencia, y un cobro rechazado se
    // reintenta con la misma venta: cada intento lleva su sufijo.
    const referenciaExterna = `${referencia.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50)}-${Date.now().toString(36)}`;
    const orden = await this.llamar<OrdenPoint>(
      'POST',
      '/v1/orders',
      {
        type: 'point',
        external_reference: referenciaExterna,
        expiration_time: PLAZO_PAGO,
        description: 'Venta Rockstar',
        transactions: { payments: [{ amount: String(monto) }] },
        config: {
          point: { terminal_id: terminal },
          payment_method: { default_type: tipo === 'CREDITO' ? 'credit_card' : 'debit_card' },
        },
      },
      { 'X-Idempotency-Key': randomUUID() },
    );
    return cobroDeOrden(orden!);
  }

  async consultar(id: string): Promise<CobroTerminal> {
    return cobroDeOrden((await this.llamar<OrdenPoint>('GET', `/v1/orders/${this.idOrden(id)}`))!);
  }

  /**
   * Desiste de un cobro sin pagar. Si la máquina ya lo tiene en pantalla, Mercado Pago
   * acepta la cancelación y la confirma después: el POS sigue consultando el cobro.
   */
  async cancelar(id: string): Promise<CobroTerminal> {
    const actual = await this.consultar(id);
    if (actual.estado !== 'PENDIENTE') {
      return actual;
    }
    await this.llamar('POST', `/v1/orders/${this.idOrden(id)}/cancel`, undefined, {
      'X-Idempotency-Key': `cancelar-${id}`,
      'x-allow-cancelable-status': 'at_terminal',
    });
    return this.consultar(id);
  }

  /** Devuelve al cliente un cobro aprobado cuya venta no se registró. */
  async anular(id: string): Promise<CobroTerminal> {
    const actual = await this.consultar(id);
    if (actual.estado === 'ANULADO') {
      return actual;
    }
    if (actual.estado !== 'APROBADO') {
      throw new ErrorDeNegocio(409, 'ESTADO_INVALIDO', `El cobro está ${actual.estado.toLowerCase()}: no hay pago que devolver.`, actual);
    }
    await this.llamar('POST', `/v1/orders/${this.idOrden(id)}/refund`, undefined, { 'X-Idempotency-Key': `anular-${id}` });
    return this.consultar(id);
  }

  private idOrden(id: string): string {
    exigir(/^[A-Za-z0-9_-]{1,64}$/.test(id), 'El cobro no es válido.');
    return id;
  }

  private async llamar<T>(metodo: string, ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = {}): Promise<T | null> {
    const { accessToken, url } = this.configuracion.mercadoPago;
    if (!accessToken) {
      throw new ErrorDeNegocio(
        503,
        'MERCADOPAGO_NO_CONFIGURADO',
        'La API no tiene la cuenta de Mercado Pago configurada (MERCADOPAGO_ACCESS_TOKEN). Usa la máquina de prueba.',
      );
    }
    let respuesta: Response;
    try {
      respuesta = await fetch(`${url}${ruta}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...cabeceras },
        ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
        signal: AbortSignal.timeout(MS_ESPERA),
      });
    } catch (error) {
      this.log.error(`${metodo} ${ruta}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ErrorDeNegocio(502, 'MERCADOPAGO_NO_DISPONIBLE', 'No se pudo conectar con Mercado Pago. Inténtalo de nuevo en unos segundos.');
    }
    const texto = await respuesta.text();
    if (respuesta.status >= 500) {
      this.log.error(`${metodo} ${ruta}: ${respuesta.status} ${texto}`);
      throw new ErrorDeNegocio(502, 'MERCADOPAGO_NO_DISPONIBLE', 'Mercado Pago no está respondiendo. Inténtalo de nuevo en unos segundos.');
    }
    if (!respuesta.ok) {
      this.log.warn(`${metodo} ${ruta}: ${respuesta.status} ${texto}`);
      throw new ErrorDeNegocio(422, 'MERCADOPAGO_RECHAZO', `Mercado Pago rechazó la operación: ${detalleDeError(texto, respuesta.status)}`);
    }
    return texto ? (JSON.parse(texto) as T) : null;
  }
}

function esIdTerminal(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,100}$/.test(id);
}

/** El mensaje o el código que trae un error de Mercado Pago, o su estado HTTP. */
function detalleDeError(texto: string, status: number): string {
  try {
    const cuerpo = JSON.parse(texto) as { message?: string; errors?: { code?: string; message?: string }[] };
    const primero = cuerpo.errors?.[0];
    return primero?.message ?? primero?.code ?? cuerpo.message ?? `HTTP ${status}`;
  } catch {
    return `HTTP ${status}`;
  }
}
