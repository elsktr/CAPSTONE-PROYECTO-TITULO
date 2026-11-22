import { Injectable } from '@nestjs/common';
import type { EventoSeguimiento, EstadoSeguimiento } from '@rockstar/contracts';

import { ErrorDeNegocio, noEncontrado } from '../comun/errores.js';
import type { ConfiguracionStarken } from '../config.js';
import type {
  DespachoEmitido,
  DestinoDeFlete,
  OrdenDeDespacho,
  SeguimientoTransportista,
  Transportista,
} from './transportista.js';

/** Solo el ambiente real tiene estos campos; el compilador impide construirlo sin ellos. */
type ConfiguracionRest = Extract<ConfiguracionStarken, { apiUrl: string }>;

const TIMEOUT_MS = 5_000;

const ESTADOS: Readonly<Record<string, EstadoSeguimiento>> = {
  PREPARADO: 'PREPARADO',
  EN_PREPARACION: 'PREPARADO',
  PREPARING: 'PREPARADO',
  EN_TRANSITO: 'EN_TRANSITO',
  TRANSITO: 'EN_TRANSITO',
  IN_TRANSIT: 'EN_TRANSITO',
  ENTREGADO: 'ENTREGADO',
  DELIVERED: 'ENTREGADO',
};

function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : {};
}

function campo(valor: unknown, ...nombres: string[]): unknown {
  const fuente = objeto(valor);
  for (const nombre of nombres) {
    if (fuente[nombre] !== undefined) {
      return fuente[nombre];
    }
  }
  return undefined;
}

function entero(valor: unknown): number {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    throw new Error('Starken devolvió un número que no es válido.');
  }
  return Math.round(numero);
}

function estado(valor: unknown): EstadoSeguimiento {
  const texto = String(valor ?? '').trim().toUpperCase();
  const resultado = ESTADOS[texto];
  if (!resultado) {
    throw new Error(`Starken devolvió un estado de seguimiento desconocido: ${texto}`);
  }
  return resultado;
}

function fecha(valor: unknown): string {
  const fecha = new Date(String(valor));
  if (Number.isNaN(fecha.getTime())) {
    throw new Error('Starken devolvió una fecha de evento que no es válida.');
  }
  return fecha.toISOString();
}

/**
 * Cliente HTTP de Starken. Toda la traducción entre los campos de su API y nuestros
 * contratos vive aquí: al recibir credenciales reales solo cambia este archivo.
 */
@Injectable()
export class StarkenRest implements Transportista {
  constructor(private readonly configuracion: ConfiguracionRest) {}

  async cotizar(destino: DestinoDeFlete): Promise<number> {
    const respuesta = await this.llamar<unknown>('/cotizaciones', {
      method: 'POST',
      body: JSON.stringify({
        comuna: destino.codigoStarken ?? destino.comuna,
        region: destino.region,
        zona: destino.zona,
        pesoGramos: destino.pesoGramos,
        volumenCm3: destino.volumenCm3,
        tramoPeso: destino.tramoPeso,
        tramoVolumen: destino.tramoVolumen,
      }),
    });
    return entero(typeof respuesta === 'number' ? respuesta : campo(respuesta, 'valor', 'total', 'precio'));
  }

  async emitirDespacho(orden: OrdenDeDespacho): Promise<DespachoEmitido> {
    const respuesta = await this.llamar<unknown>('/ordenes', {
      method: 'POST',
      headers: { 'Idempotency-Key': orden.idempotencia },
      body: JSON.stringify({
        referencia: String(orden.referencia),
        destinatario: orden.destinatario,
        direccion: orden.direccion,
        comuna: orden.comuna,
        region: orden.region,
        telefono: orden.telefono,
        fleteCotizado: orden.fleteCotizado,
      }),
    });
    const seguimiento = campo(respuesta, 'seguimiento', 'codigoSeguimiento', 'tracking', 'numero');
    if (typeof seguimiento !== 'string' || seguimiento === '') {
      throw new Error('Starken no devolvió un código de seguimiento.');
    }
    return { seguimiento, costo: entero(campo(respuesta, 'costo', 'monto', 'precio')) };
  }

  async consultarSeguimiento(codigo: string, _despachadoEn: Date): Promise<SeguimientoTransportista> {
    const respuesta = await this.llamar<unknown>(`/envios/${encodeURIComponent(codigo)}/seguimiento`, { method: 'GET' });
    const crudos = campo(respuesta, 'eventos', 'historial', 'events');
    const eventos: EventoSeguimiento[] = Array.isArray(crudos)
      ? crudos.map((crudo) => ({
          estado: estado(campo(crudo, 'estado', 'status', 'codigo')),
          descripcion: String(campo(crudo, 'descripcion', 'detalle', 'description', 'mensaje') ?? ''),
          fecha: fecha(campo(crudo, 'fecha', 'date', 'fechaEvento')),
        }))
      : [];
    const actual = estado(campo(respuesta, 'estado', 'status', 'codigo'));
    if (eventos.length === 0 || eventos[eventos.length - 1]!.estado !== actual) {
      eventos.push({ estado: actual, descripcion: 'Estado actual del envío', fecha: new Date().toISOString() });
    }
    return { codigo, estado: actual, eventos };
  }

  private noDisponible(causa: unknown): ErrorDeNegocio {
    const detalle = causa instanceof Error ? causa.message : String(causa);
    return new ErrorDeNegocio(
      503,
      'TRANSPORTISTA_NO_DISPONIBLE',
      'Starken no respondió. Reintenta en unos minutos.',
      detalle.slice(0, 200),
    );
  }

  private async llamar<T>(ruta: string, init: RequestInit): Promise<T> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.configuracion.apiUrl}${ruta}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${this.configuracion.usuario}:${this.configuracion.clave}`).toString('base64')}`,
          ...init.headers,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw this.noDisponible(error);
    }
    if (respuesta.status === 404) {
      throw noEncontrado('El envío no existe.');
    }
    if (respuesta.status === 400 || respuesta.status === 422) {
      throw new ErrorDeNegocio(400, 'SIN_COBERTURA', 'Starken no tiene cobertura para ese destino.');
    }
    if (!respuesta.ok) {
      const cuerpo = await respuesta.text().catch(() => '');
      throw this.noDisponible(new Error(`HTTP ${respuesta.status}: ${cuerpo.slice(0, 200)}`));
    }
    return (await respuesta.json()) as T;
  }
}
