import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConfiguracionStarken } from '../config.js';
import { StarkenRest } from './starken-rest.js';
import type { DestinoDeFlete, OrdenDeDespacho } from './transportista.js';

const configuracion: Extract<ConfiguracionStarken, { apiUrl: string }> = {
  ambiente: 'integracion',
  apiUrl: 'https://starken.cl/api',
  usuario: 'usuario',
  clave: 'clave',
  sincronizacionMs: 60_000,
  tramoPesoGramos: 1_000,
  tramoVolumenCm3: 5_000,
};

const destino: DestinoDeFlete = {
  comuna: 'Providencia',
  region: 'Región Metropolitana',
  zona: 'SANTIAGO',
  codigoStarken: 'STK-COM-123',
  pesoGramos: 2_000,
  volumenCm3: 3_000,
  tramoPeso: 2,
  tramoVolumen: 1,
};

const orden: OrdenDeDespacho = {
  referencia: 1001,
  idempotencia: 'RS-1001',
  destinatario: 'Cliente Demo',
  direccion: 'Av. Siempre Viva 742',
  comuna: 'Providencia',
  region: 'Región Metropolitana',
  telefono: null,
  fleteCotizado: 3990,
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('StarkenRest', () => {
  it('cotiza con la comuna y el tamaño del carrito', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ valor: 4200 }));
    vi.stubGlobal('fetch', fetch);

    expect(await new StarkenRest(configuracion).cotizar(destino)).toBe(4200);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://starken.cl/api/cotizaciones');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({ comuna: 'STK-COM-123', pesoGramos: 2_000, volumenCm3: 3_000 });
    expect(String((init.headers as Record<string, string>)['Authorization'])).toMatch(/^Basic /);
  });

  it('emite con la clave de idempotencia y traduce la respuesta', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ codigoSeguimiento: 'STK-123', monto: 4150 }));
    vi.stubGlobal('fetch', fetch);

    expect(await new StarkenRest(configuracion).emitirDespacho(orden)).toEqual({ seguimiento: 'STK-123', costo: 4150 });
    const init = fetch.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('RS-1001');
  });

  it('consulta el seguimiento y normaliza estados y eventos', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        status: 'DELIVERED',
        eventos: [{ status: 'in_transit', description: 'En camino', date: '2026-01-01T01:00:00Z' }],
      }),
    );
    vi.stubGlobal('fetch', fetch);

    const seguimiento = await new StarkenRest(configuracion).consultarSeguimiento('STK-123', new Date('2026-01-01T00:00:00Z'));
    expect(fetch.mock.calls[0]![0]).toBe('https://starken.cl/api/envios/STK-123/seguimiento');
    expect(seguimiento.estado).toBe('ENTREGADO');
    expect(seguimiento.eventos.map((evento) => evento.estado)).toEqual(['EN_TRANSITO', 'ENTREGADO']);
    expect(seguimiento.eventos[0]).toMatchObject({ descripcion: 'En camino', fecha: '2026-01-01T01:00:00.000Z' });
  });

  it('traduce la falta de cobertura y los fallos del proveedor', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ mensaje: 'sin cobertura' }, 422)).mockResolvedValueOnce(json({}, 503));
    vi.stubGlobal('fetch', fetch);

    await expect(new StarkenRest(configuracion).cotizar(destino)).rejects.toMatchObject({
      status: 400,
      codigo: 'SIN_COBERTURA',
    });
    await expect(new StarkenRest(configuracion).cotizar(destino)).rejects.toMatchObject({
      status: 503,
      codigo: 'TRANSPORTISTA_NO_DISPONIBLE',
    });
  });

  it('un error de red y un 404 se traducen', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(json({}, 404));
    vi.stubGlobal('fetch', fetch);

    await expect(new StarkenRest(configuracion).cotizar(destino)).rejects.toMatchObject({
      status: 503,
      codigo: 'TRANSPORTISTA_NO_DISPONIBLE',
    });
    await expect(new StarkenRest(configuracion).consultarSeguimiento('STK-1', new Date())).rejects.toMatchObject({
      status: 404,
      codigo: 'NO_ENCONTRADO',
    });
  });
});
