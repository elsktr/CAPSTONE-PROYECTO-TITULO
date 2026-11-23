import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DestinoDeFlete, OrdenDeDespacho } from './transportista.js';
import { StarkenSimulado } from './transportista.js';

const destino = (zona: 'SANTIAGO' | 'REGIONES', tramoPeso = 1, tramoVolumen = 1): DestinoDeFlete => ({
  comuna: 'Providencia',
  region: 'Región Metropolitana',
  zona,
  codigoStarken: null,
  pesoGramos: tramoPeso * 1000,
  volumenCm3: tramoVolumen * 5000,
  tramoPeso,
  tramoVolumen,
});

const orden = (referencia: number): OrdenDeDespacho => ({
  referencia,
  idempotencia: `RS-${referencia}`,
  destinatario: 'Cliente Demo',
  direccion: 'Av. Siempre Viva 742',
  comuna: 'Providencia',
  region: 'Región Metropolitana',
  telefono: '+56 9 1234 5678',
  fleteCotizado: 3990,
});

afterEach(() => vi.useRealTimers());

describe('StarkenSimulado', () => {
  it('mantiene la tarifa histórica en el tramo mínimo y la sube por peso y volumen', async () => {
    const transportista = new StarkenSimulado();
    expect(await transportista.cotizar(destino('SANTIAGO'))).toBe(3990);
    expect(await transportista.cotizar(destino('REGIONES'))).toBe(7990);
    expect(await transportista.cotizar(destino('SANTIAGO', 2, 3))).toBe(3990 + 500 + 2 * 300);
  });

  it('la misma referencia produce siempre el mismo código de seguimiento', async () => {
    const transportista = new StarkenSimulado();
    expect(await transportista.emitirDespacho(orden(1001))).toEqual({ seguimiento: 'STK-901001', costo: 3990 });
    expect(await transportista.emitirDespacho(orden(1001))).toEqual(await transportista.emitirDespacho(orden(1001)));
    expect((await transportista.emitirDespacho(orden(1002))).seguimiento).toBe('STK-901002');
  });

  it('los eventos avanzan de preparado a entregado sin red', async () => {
    vi.useFakeTimers();
    const salida = new Date('2026-01-01T00:00:00Z');
    vi.setSystemTime(salida);
    const transportista = new StarkenSimulado();

    expect(await transportista.consultarSeguimiento('STK-901001', salida)).toMatchObject({ estado: 'PREPARADO' });

    vi.setSystemTime(new Date(salida.getTime() + 7 * 3_600_000));
    const transito = await transportista.consultarSeguimiento('STK-901001', salida);
    expect(transito.estado).toBe('EN_TRANSITO');
    expect(transito.eventos.map((evento) => evento.estado)).toEqual(['PREPARADO', 'EN_TRANSITO']);
    expect(transito.eventos[0]!.fecha).toBe(salida.toISOString());

    vi.setSystemTime(new Date(salida.getTime() + 25 * 3_600_000));
    const entregado = await transportista.consultarSeguimiento('STK-901001', salida);
    expect(entregado.estado).toBe('ENTREGADO');
    expect(entregado.eventos).toHaveLength(3);
  });

  it('un código que no existe se rechaza', async () => {
    await expect(new StarkenSimulado().consultarSeguimiento('OTRO-1', new Date())).rejects.toMatchObject({ status: 404 });
  });
});
