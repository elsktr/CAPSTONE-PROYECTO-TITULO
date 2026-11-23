/**
 * Maquina de cobro (terminal de tarjetas) de la caja, en uno de dos modos:
 *
 * - Prueba: la maquina simulada (`terminal-simulada/`), a la que el navegador de la caja
 *   le habla directo por HTTP a su IP. Responde con los codigos de Mercado Pago Point.
 * - Mercado Pago Point: una maquina real. La caja le pide a la API que cobre en ella; la
 *   API tiene el access token de la cuenta de Mercado Pago.
 *
 * Las dos cumplen `MaquinaDeCobro`: el flujo de venta no distingue cual se usa.
 */

import {
  ErrorApi,
  anularCobroPoint,
  cancelarCobroPoint,
  cobrarEnPoint,
  consultarCobroPoint,
  getTerminalesPoint,
  type MedioPresencial,
  type PagoMaquina,
} from './api';

export type TipoTarjeta = 'DEBITO' | 'CREDITO';
/** `REVISAR`: la maquina no informo el resultado; hay que mirarlo en su pantalla. */
export type EstadoCobro = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'CANCELADO' | 'ANULADO' | 'REVISAR';

export interface CobroMaquina {
  id: string;
  monto: number;
  tipo: TipoTarjeta;
  referencia: string | null;
  estado: EstadoCobro;
  codigoAutorizacion: string | null;
  /** Ultimos digitos, por ejemplo "•••• 4242". */
  tarjeta: string | null;
  motivo: string | null;
  /** Codigo de Mercado Pago del resultado, por ejemplo `accredited` o `insufficient_amount`. */
  codigo?: string | null;
}

export interface InfoMaquina {
  nombre: string;
  modelo: string;
  serie: string;
}

export interface MaquinaDeCobro {
  info(): Promise<InfoMaquina>;
  cobrar(monto: number, tipo: TipoTarjeta, referencia: string): Promise<CobroMaquina>;
  consultar(id: string): Promise<CobroMaquina>;
  /** Desiste de un cobro que aun no se paga. Si ya se pago, responde el cobro aprobado. */
  cancelar(id: string): Promise<CobroMaquina>;
  /** Reversa un cobro aprobado. */
  anular(id: string): Promise<CobroMaquina>;
  /** Cada cuanto consultar el cobro mientras se espera el pago; por omision, cada segundo. */
  readonly intervaloMs?: number;
}

export class ErrorMaquina extends Error {
  constructor(
    mensaje: string,
    readonly codigo: 'SIN_CONEXION' | 'OCUPADA' | 'ESTADO_INVALIDO' | 'RESPUESTA_INVALIDA' | string,
    readonly cobro?: CobroMaquina,
  ) {
    super(mensaje);
  }
}

/** `prueba`: la maquina simulada en la red. `mercadopago`: una maquina Point real. */
export type ModoMaquina = 'prueba' | 'mercadopago';

/** Configuracion de esta caja: cada caja tiene su maquina al lado. */
export interface ConfigMaquina {
  activa: boolean;
  modo: ModoMaquina;
  /** Maquina de prueba: IP y puerto en la red, por ejemplo "192.168.1.50:8090". */
  direccion: string;
  /** Maquina Mercado Pago Point: su identificador, por ejemplo "NEWLAND_N950__N950NCB123456789". */
  terminal: string;
}

const CONFIG_KEY = 'pos_maquina_cobro';
export const CONFIG_MAQUINA_INICIAL: ConfigMaquina = { activa: false, modo: 'prueba', direccion: 'localhost:8090', terminal: '' };

export function leerConfigMaquina(): ConfigMaquina {
  try {
    const guardada = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null') as Partial<ConfigMaquina> | null;
    return {
      activa: guardada?.activa === true,
      // Una configuracion de antes de los modos era siempre la maquina simulada.
      modo: guardada?.modo === 'mercadopago' ? 'mercadopago' : 'prueba',
      direccion: typeof guardada?.direccion === 'string' && guardada.direccion.trim() ? guardada.direccion : CONFIG_MAQUINA_INICIAL.direccion,
      terminal: typeof guardada?.terminal === 'string' ? guardada.terminal : '',
    };
  } catch {
    return CONFIG_MAQUINA_INICIAL;
  }
}

export function guardarConfigMaquina(config: ConfigMaquina): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Sin almacenamiento la configuracion dura lo que dure la pestana.
  }
}

/** "192.168.1.50:8090", "http://192.168.1.50:8090/" o "maquina.local" -> URL base sin barra final. */
export function urlBase(direccion: string): string {
  const limpia = direccion.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(limpia) ? limpia : `http://${limpia}`;
}

/** La tarjeta de debito o credito que se pasa por la maquina; el efectivo no la usa. */
export function tipoTarjeta(medio: MedioPresencial): TipoTarjeta | null {
  if (medio === 'DEBITO_PRESENCIAL') return 'DEBITO';
  if (medio === 'CREDITO_PRESENCIAL') return 'CREDITO';
  return null;
}

/** "•••• 4242" -> "4242". La maquina muestra la tarjeta enmascarada; se guardan solo los ultimos digitos. */
export function ultimosDigitos(tarjeta: string | null): string | null {
  return tarjeta?.match(/(\d{4})\s*$/)?.[1] ?? null;
}

/** El pago aprobado tal como se envia al backend junto a la venta. */
export function pagoParaVenta(cobro: CobroMaquina): PagoMaquina {
  return { idCobro: cobro.id, codigoAutorizacion: cobro.codigoAutorizacion ?? '', ultimosDigitos: ultimosDigitos(cobro.tarjeta) };
}

const ESPERA_RESPUESTA_MS = 5000;

/** Cliente HTTP de la maquina (protocolo de `terminal-simulada/servidor.mjs`). */
export function maquinaHttp(direccion: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): MaquinaDeCobro {
  const base = urlBase(direccion);

  const pedir = async <T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<T> => {
    const control = new AbortController();
    const plazo = setTimeout(() => control.abort(), ESPERA_RESPUESTA_MS);
    let res: Response;
    try {
      res = await fetchImpl(`${base}${ruta}`, {
        method: metodo,
        headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: control.signal,
        cache: 'no-store',
      });
    } catch {
      throw new ErrorMaquina(
        `No se pudo conectar con la máquina de cobro en ${base}. Revisa que esté encendida y en la misma red.`,
        'SIN_CONEXION',
      );
    } finally {
      clearTimeout(plazo);
    }
    let datos: unknown = null;
    try {
      datos = await res.json();
    } catch {
      throw new ErrorMaquina('La máquina de cobro respondió algo inesperado.', 'RESPUESTA_INVALIDA');
    }
    if (!res.ok) {
      const error = (datos ?? {}) as { codigo?: string; mensaje?: string; detalle?: CobroMaquina };
      throw new ErrorMaquina(error.mensaje ?? `La máquina respondió ${res.status}.`, error.codigo ?? String(res.status), error.detalle);
    }
    return datos as T;
  };

  return {
    info: () => pedir<InfoMaquina>('GET', '/api/estado'),
    cobrar: (monto, tipo, referencia) => pedir<CobroMaquina>('POST', '/api/cobros', { monto, tipo, referencia }),
    consultar: (id) => pedir<CobroMaquina>('GET', `/api/cobros/${encodeURIComponent(id)}`),
    cancelar: async (id) => {
      try {
        return await pedir<CobroMaquina>('POST', `/api/cobros/${encodeURIComponent(id)}/cancelar`);
      } catch (error) {
        // Se pago justo antes de cancelar: la maquina devuelve el cobro como quedo.
        if (error instanceof ErrorMaquina && error.codigo === 'ESTADO_INVALIDO' && error.cobro) return error.cobro;
        throw error;
      }
    },
    anular: (id) => pedir<CobroMaquina>('POST', `/api/cobros/${encodeURIComponent(id)}/anular`),
  };
}

/** La maquina Point se consulta cada 2 segundos: cada consulta pasa por la API hasta Mercado Pago. */
const INTERVALO_POINT_MS = 2000;

/** "NEWLAND_N950__N950NCB123456789" -> modelo "NEWLAND N950" y serie "N950NCB123456789". */
export function partesTerminal(id: string): { modelo: string; serie: string } {
  const [modelo, serie] = id.includes('__') ? id.split('__') : ['Point', id];
  return { modelo: modelo.replace(/_/g, ' '), serie };
}

/**
 * Maquina Mercado Pago Point real, a traves de la API (`/pagos/point`). Los errores de la
 * API llegan como `ErrorMaquina`, con el mismo codigo, para que el flujo de venta los trate
 * igual que los de la maquina de prueba.
 */
export function maquinaMercadoPago(accessToken: string, terminal: string): MaquinaDeCobro {
  const conErrores = async <T>(llamada: () => Promise<T>): Promise<T> => {
    try {
      return await llamada();
    } catch (error) {
      if (error instanceof ErrorMaquina) throw error;
      if (error instanceof ErrorApi) {
        const cobro = error.codigo === 'ESTADO_INVALIDO' ? (error.detalle as CobroMaquina | undefined) : undefined;
        throw new ErrorMaquina(error.message, error.codigo ?? String(error.status), cobro);
      }
      throw new ErrorMaquina('No se pudo conectar con el servidor para usar la máquina Mercado Pago.', 'SIN_CONEXION');
    }
  };

  return {
    intervaloMs: INTERVALO_POINT_MS,
    info: () =>
      conErrores(async () => {
        if (!terminal) throw new ErrorMaquina('Elige la máquina Mercado Pago de esta caja.', 'SIN_TERMINAL');
        const encontrada = (await getTerminalesPoint(accessToken)).find((t) => t.id === terminal);
        if (!encontrada) throw new ErrorMaquina(`La máquina ${terminal} no está en la cuenta de Mercado Pago.`, 'NO_ENCONTRADO');
        if (encontrada.modo !== 'PDV') {
          throw new ErrorMaquina('La máquina no está en modo PDV: usa "Activar en modo PDV" y reiníciala.', 'NO_PDV');
        }
        return { nombre: 'Mercado Pago Point', ...partesTerminal(terminal) };
      }),
    cobrar: (monto, tipo, referencia) => conErrores(() => cobrarEnPoint(accessToken, { terminal, monto, tipo, referencia })),
    consultar: (id) => conErrores(() => consultarCobroPoint(accessToken, id)),
    // La API ya responde el cobro aprobado si el cliente alcanzo a pagar antes de cancelar.
    cancelar: (id) => conErrores(() => cancelarCobroPoint(accessToken, id)),
    anular: (id) => conErrores(() => anularCobroPoint(accessToken, id)),
  };
}

/** La maquina de esta caja segun su configuracion. */
export function maquinaDeConfig(config: ConfigMaquina, accessToken: string): MaquinaDeCobro {
  return config.modo === 'mercadopago' ? maquinaMercadoPago(accessToken, config.terminal) : maquinaHttp(config.direccion);
}

/** Fallas de red seguidas que se toleran mientras se espera el pago. */
const FALLAS_TOLERADAS = 5;

/**
 * Consulta el cobro hasta que deje de estar pendiente. Un corte de red pasajero no lo
 * interrumpe; `senal` permite dejar de esperar (por ejemplo, al cancelar desde la caja).
 */
export async function esperarResultado(
  maquina: MaquinaDeCobro,
  id: string,
  { intervaloMs = maquina.intervaloMs ?? 1000, senal }: { intervaloMs?: number; senal?: AbortSignal } = {},
): Promise<CobroMaquina> {
  let fallas = 0;
  for (;;) {
    if (senal?.aborted) throw new DOMException('Espera cancelada', 'AbortError');
    try {
      const cobro = await maquina.consultar(id);
      fallas = 0;
      if (cobro.estado !== 'PENDIENTE') return cobro;
    } catch (error) {
      if (!(error instanceof ErrorMaquina && error.codigo === 'SIN_CONEXION') || ++fallas > FALLAS_TOLERADAS) throw error;
    }
    await new Promise((listo) => setTimeout(listo, intervaloMs));
  }
}
