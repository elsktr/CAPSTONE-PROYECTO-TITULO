/**
 * Maquina de cobro (terminal de tarjetas) de la caja, en uno de tres modos:
 *
 * - Prueba: la maquina simulada (`terminal-simulada/`), a la que el navegador de la caja
 *   le habla directo por HTTP a su IP. Responde con los codigos de Mercado Pago Point.
 * - Caja: una maquina simulada dentro del mismo POS, sin nada que instalar. Sirve en un
 *   telefono o en la web publicada, donde no hay maquina de prueba en la red.
 * - Mercado Pago Point: una maquina real. La caja le pide a la API que cobre en ella; la
 *   API tiene el access token de la cuenta de Mercado Pago.
 *
 * Todas cumplen `MaquinaDeCobro`: el flujo de venta no distingue cual se usa. Las simuladas
 * ademas permiten aprobar o rechazar el cobro desde la caja (`simular`).
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
  /**
   * Solo las maquinas simuladas: resuelve el cobro pendiente como si el cliente hubiera
   * pagado o el banco lo hubiera rechazado. Una maquina real no lo tiene.
   */
  simular?(id: string, resultado: ResultadoSimulado): Promise<void>;
}

export type ResultadoSimulado = 'APROBAR' | 'RECHAZAR';

/** Codigo de Mercado Pago con que se simula un rechazo. */
const RECHAZO_SIMULADO = { codigo: 'insufficient_amount', motivo: 'Fondos insuficientes.' };

export class ErrorMaquina extends Error {
  constructor(
    mensaje: string,
    readonly codigo: 'SIN_CONEXION' | 'OCUPADA' | 'ESTADO_INVALIDO' | 'RESPUESTA_INVALIDA' | string,
    readonly cobro?: CobroMaquina,
  ) {
    super(mensaje);
  }
}

/** `prueba`: la maquina simulada en la red. `caja`: simulada en el POS. `mercadopago`: una maquina Point real. */
export type ModoMaquina = 'prueba' | 'caja' | 'mercadopago';
const MODOS: readonly ModoMaquina[] = ['prueba', 'caja', 'mercadopago'];

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
      modo: MODOS.includes(guardada?.modo as ModoMaquina) ? (guardada!.modo as ModoMaquina) : 'prueba',
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
    // Los mismos botones que tiene la pantalla de la maquina simulada.
    simular: async (id, resultado) => {
      const ruta = `/api/cobros/${encodeURIComponent(id)}/${resultado === 'APROBAR' ? 'aprobar' : 'rechazar'}`;
      await pedir<CobroMaquina>('POST', ruta, resultado === 'RECHAZAR' ? { codigo: RECHAZO_SIMULADO.codigo } : {});
    },
  };
}

/** Numero de `digitos` cifras al azar, con ceros a la izquierda. */
function cifras(digitos: number): string {
  return String(Math.floor(Math.random() * 10 ** digitos)).padStart(digitos, '0');
}

/**
 * Identificador del cobro simulado. `crypto.randomUUID` solo existe en paginas seguras (https
 * o localhost); el POS abierto por la IP del equipo no lo es.
 */
function idSimulado(): string {
  return globalThis.crypto?.randomUUID?.() ?? `caja-${Date.now().toString(36)}-${cifras(8)}`;
}

/**
 * Maquina simulada dentro del POS: guarda los cobros en memoria y los resuelve con `simular`.
 * Imita a la maquina de prueba: un cobro a la vez y los mismos estados y codigos.
 */
export function maquinaEnLaCaja(): MaquinaDeCobro {
  const cobros = new Map<string, CobroMaquina>();
  const buscar = (id: string): CobroMaquina => {
    const cobro = cobros.get(id);
    if (!cobro) throw new ErrorMaquina('El cobro no existe.', 'NO_ENCONTRADO');
    return cobro;
  };
  const cambiar = (id: string, desde: CobroMaquina['estado'], cambios: Partial<CobroMaquina>): CobroMaquina => {
    const cobro = buscar(id);
    if (cobro.estado !== desde) {
      throw new ErrorMaquina(`El cobro está ${cobro.estado.toLowerCase()}.`, 'ESTADO_INVALIDO', { ...cobro });
    }
    Object.assign(cobro, cambios);
    return { ...cobro };
  };

  return {
    intervaloMs: 500,
    info: async () => ({ nombre: 'Máquina simulada en la caja', modelo: 'Simulada', serie: 'CAJA' }),
    cobrar: async (monto, tipo, referencia) => {
      if ([...cobros.values()].some((c) => c.estado === 'PENDIENTE')) {
        throw new ErrorMaquina('La máquina tiene otro cobro en curso.', 'OCUPADA');
      }
      const cobro: CobroMaquina = {
        id: idSimulado(), monto, tipo, referencia, estado: 'PENDIENTE',
        codigoAutorizacion: null, tarjeta: null, motivo: null, codigo: null,
      };
      cobros.set(cobro.id, cobro);
      return { ...cobro };
    },
    consultar: async (id) => ({ ...buscar(id) }),
    cancelar: async (id) => {
      const cobro = buscar(id);
      // Igual que la maquina de prueba: si ya se pago, se responde el cobro como quedo.
      if (cobro.estado !== 'PENDIENTE') return { ...cobro };
      return cambiar(id, 'PENDIENTE', { estado: 'CANCELADO', motivo: 'Cobro cancelado desde la caja.', codigo: 'canceled' });
    },
    anular: async (id) => {
      if (buscar(id).estado === 'ANULADO') return { ...buscar(id) };
      return cambiar(id, 'APROBADO', { estado: 'ANULADO' });
    },
    simular: async (id, resultado) => {
      cambiar(
        id,
        'PENDIENTE',
        resultado === 'APROBAR'
          ? { estado: 'APROBADO', codigo: 'accredited', codigoAutorizacion: cifras(6), tarjeta: `•••• ${cifras(4)}` }
          : { estado: 'RECHAZADO', ...RECHAZO_SIMULADO },
      );
    },
  };
}

/** La maquina de la caja vive mientras el POS esta abierto: la misma para todas las ventas. */
let maquinaDeLaCaja: MaquinaDeCobro | null = null;

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
  if (config.modo === 'mercadopago') return maquinaMercadoPago(accessToken, config.terminal);
  if (config.modo === 'caja') return (maquinaDeLaCaja ??= maquinaEnLaCaja());
  return maquinaHttp(config.direccion);
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
