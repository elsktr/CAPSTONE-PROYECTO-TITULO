import { type IncomingMessage, type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { CobroTerminal, ErrorApi, SesionResponse, TerminalPoint } from '@rockstar/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { iniciarEntornoLocal } from './entorno-local.mjs';

/**
 * Máquinas Mercado Pago Point. La API habla con un doble de Mercado Pago levantado aquí
 * (MERCADOPAGO_API_URL), que guarda lo que recibe y responde órdenes como la API de Órdenes.
 */

const TOKEN_MP = 'TEST-0000-token-de-prueba';
const TERMINAL = 'NEWLAND_N950__SBX0000001';

interface Recibida {
  metodo: string;
  ruta: string;
  cabeceras: IncomingMessage['headers'];
  cuerpo: unknown;
}

let apiUrl: string;
let detener: () => Promise<void>;
let mercadoPago: Server;
let recibidas: Recibida[];
/** Órdenes del doble, por id. Cada prueba deja la orden en el estado que necesita. */
const ordenes = new Map<string, Record<string, unknown>>();
let vendedor: string;

function orden(id: string, status: string, pago: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'point',
    status,
    status_detail: status,
    external_reference: 'venta-1',
    config: { point: { terminal_id: TERMINAL }, payment_method: { default_type: 'debit_card' } },
    transactions: { payments: [{ id: 'PAY01', amount: '15990', status, status_detail: status, ...pago }] },
    ...extra,
  };
}

async function llamar<T>(metodo: string, ruta: string, cuerpo?: unknown, token = vendedor, base = apiUrl): Promise<{ status: number; cuerpo: T }> {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }), Authorization: `Bearer ${token}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as T };
}

beforeAll(async () => {
  mercadoPago = createServer(async (req, res) => {
    let texto = '';
    for await (const parte of req) texto += parte;
    const ruta = req.url ?? '';
    recibidas.push({ metodo: req.method!, ruta, cabeceras: req.headers, cuerpo: texto ? JSON.parse(texto) : undefined });
    const responder = (status: number, cuerpo?: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(cuerpo === undefined ? '' : JSON.stringify(cuerpo));
    };
    if (req.headers.authorization !== `Bearer ${TOKEN_MP}`) return responder(401, { message: 'invalid token' });
    if (ruta.startsWith('/terminals/v1/list')) {
      return responder(200, { data: { terminals: [{ id: TERMINAL, pos_id: '1', store_id: '2', operating_mode: 'STANDALONE' }] } });
    }
    if (ruta === '/terminals/v1/setup') return responder(200, (JSON.parse(texto) as unknown));
    if (ruta === '/v1/orders' && req.method === 'POST') {
      const creada = orden('ORD0001', 'created');
      ordenes.set('ORD0001', creada);
      return responder(201, creada);
    }
    const accion = /^\/v1\/orders\/(\w+)(?:\/(cancel|refund))?$/.exec(ruta);
    const existente = accion && ordenes.get(accion[1]!);
    if (!existente) return responder(404, { errors: [{ code: 'order_not_found', message: 'Order not found' }] });
    if (accion[2] === 'cancel') ordenes.set(accion[1]!, orden(accion[1]!, 'canceled', { status_detail: 'canceled_by_api' }));
    if (accion[2] === 'refund') ordenes.set(accion[1]!, orden(accion[1]!, 'refunded', { reference_id: '115019989861' }));
    return responder(200, ordenes.get(accion[1]!));
  });
  await new Promise<void>((listo) => mercadoPago.listen(0, '127.0.0.1', listo));
  const { port } = mercadoPago.address() as AddressInfo;

  ({ apiUrl, detener } = await iniciarEntornoLocal({
    silencioso: true,
    entorno: { MERCADOPAGO_ACCESS_TOKEN: TOKEN_MP, MERCADOPAGO_API_URL: `http://127.0.0.1:${port}` },
  }));
  const sesion = await fetch(`${apiUrl}/usuarios/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'vendedor@rockstar.cl', password: 'vendedor123' }),
  });
  vendedor = ((await sesion.json()) as SesionResponse).accessToken;
});

afterAll(async () => {
  await detener?.();
  await new Promise((listo) => mercadoPago?.close(listo));
});

beforeEach(() => {
  recibidas = [];
  ordenes.clear();
});

describe('máquinas Mercado Pago Point', () => {
  it('lista las máquinas de la cuenta y activa una en modo PDV', async () => {
    expect((await llamar<TerminalPoint[]>('GET', '/pagos/point/terminales')).cuerpo).toEqual([{ id: TERMINAL, modo: 'STANDALONE' }]);

    const { status, cuerpo } = await llamar<TerminalPoint>('POST', `/pagos/point/terminales/${TERMINAL}/activar`);

    expect(status).toBe(200);
    expect(cuerpo).toEqual({ id: TERMINAL, modo: 'PDV' });
    expect(recibidas.at(-1)).toMatchObject({
      metodo: 'PATCH',
      ruta: '/terminals/v1/setup',
      cuerpo: { terminals: [{ id: TERMINAL, operating_mode: 'PDV' }] },
    });
  });

  it('envía el cobro a la máquina como una orden de Mercado Pago', async () => {
    const { status, cuerpo } = await llamar<CobroTerminal>('POST', '/pagos/point/cobros', {
      terminal: TERMINAL,
      monto: 15990,
      tipo: 'DEBITO',
      referencia: 'venta-1',
    });

    expect(status).toBe(201);
    expect(cuerpo).toMatchObject({ id: 'ORD0001', monto: 15990, tipo: 'DEBITO', estado: 'PENDIENTE', motivo: null, codigo: null });
    const enviada = recibidas.at(-1)!;
    expect(enviada).toMatchObject({
      metodo: 'POST',
      ruta: '/v1/orders',
      cuerpo: {
        type: 'point',
        transactions: { payments: [{ amount: '15990' }] },
        config: { point: { terminal_id: TERMINAL }, payment_method: { default_type: 'debit_card' } },
      },
    });
    expect((enviada.cuerpo as { external_reference: string }).external_reference).toMatch(/^venta-1-[a-z0-9]+$/);
    expect(enviada.cabeceras['x-idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('traduce el resultado de la máquina: aprobado, rechazado con su código, cancelado, expirado y por revisar', async () => {
    const casos: [Record<string, unknown>, Partial<CobroTerminal>][] = [
      [
        orden('ORD1', 'processed', { status_detail: 'accredited', reference_id: '115019989861', card: { last_digits: '4242' }, payment_method: { type: 'credit_card' } }),
        { estado: 'APROBADO', codigo: 'accredited', codigoAutorizacion: '115019989861', tarjeta: '•••• 4242', tipo: 'CREDITO' },
      ],
      [
        orden('ORD2', 'failed', { status_detail: 'insufficient_amount' }),
        { estado: 'RECHAZADO', codigo: 'insufficient_amount', motivo: 'Fondos insuficientes.', codigoAutorizacion: null },
      ],
      [orden('ORD3', 'failed', { status_detail: 'card_disabled' }), { estado: 'RECHAZADO', motivo: 'La tarjeta está bloqueada o inhabilitada.' }],
      [orden('ORD4', 'canceled', { status_detail: 'canceled_on_terminal' }), { estado: 'CANCELADO', motivo: 'Se canceló en la máquina.' }],
      [orden('ORD5', 'expired'), { estado: 'CANCELADO', motivo: 'Se acabó el tiempo para pagar en la máquina.' }],
      [orden('ORD6', 'action_required', { status_detail: 'check_on_terminal' }), { estado: 'REVISAR', codigo: 'check_on_terminal' }],
      [orden('ORD7', 'failed', { status_detail: 'codigo_nuevo' }), { estado: 'RECHAZADO', motivo: 'Mercado Pago informó codigo_nuevo.' }],
    ];
    for (const [enMercadoPago, esperado] of casos) {
      ordenes.set(enMercadoPago.id as string, enMercadoPago);
      expect((await llamar<CobroTerminal>('GET', `/pagos/point/cobros/${enMercadoPago.id}`)).cuerpo).toMatchObject(esperado);
    }
  });

  it('cancela en la máquina un cobro sin pagar y no cancela uno ya pagado', async () => {
    ordenes.set('ORD8', orden('ORD8', 'at_terminal'));

    const { cuerpo } = await llamar<CobroTerminal>('POST', '/pagos/point/cobros/ORD8/cancelar');

    expect(cuerpo).toMatchObject({ estado: 'CANCELADO', codigo: 'canceled_by_api', motivo: 'Se canceló desde la caja.' });
    const cancelacion = recibidas.find((r) => r.ruta === '/v1/orders/ORD8/cancel')!;
    expect(cancelacion.cabeceras['x-allow-cancelable-status']).toBe('at_terminal');
    expect(cancelacion.cabeceras['x-idempotency-key']).toBe('cancelar-ORD8');

    // El cliente alcanzó a pagar: cancelar responde el cobro aprobado, sin pedir nada más.
    ordenes.set('ORD9', orden('ORD9', 'processed', { status_detail: 'accredited', reference_id: '1' }));
    recibidas = [];
    expect((await llamar<CobroTerminal>('POST', '/pagos/point/cobros/ORD9/cancelar')).cuerpo.estado).toBe('APROBADO');
    expect(recibidas.map((r) => r.metodo)).toEqual(['GET']);
  });

  it('anula un cobro aprobado devolviéndolo, y no anula uno sin pagar', async () => {
    ordenes.set('ORD10', orden('ORD10', 'processed', { status_detail: 'accredited', reference_id: '115019989861' }));

    expect((await llamar<CobroTerminal>('POST', '/pagos/point/cobros/ORD10/anular')).cuerpo).toMatchObject({ estado: 'ANULADO', motivo: 'Pago devuelto al cliente.' });
    expect(recibidas.some((r) => r.metodo === 'POST' && r.ruta === '/v1/orders/ORD10/refund')).toBe(true);

    ordenes.set('ORD11', orden('ORD11', 'failed', { status_detail: 'high_risk' }));
    expect(await llamar<ErrorApi>('POST', '/pagos/point/cobros/ORD11/anular')).toMatchObject({
      status: 409,
      cuerpo: { codigo: 'ESTADO_INVALIDO' },
    });
  });

  it('valida el cobro antes de enviarlo y explica los rechazos de Mercado Pago', async () => {
    expect((await llamar<ErrorApi>('POST', '/pagos/point/cobros', { terminal: TERMINAL, monto: 0, tipo: 'DEBITO', referencia: 'x' })).cuerpo).toEqual({
      codigo: 'DATOS_INVALIDOS',
      mensaje: 'El monto debe ser un entero mayor que cero.',
    });
    expect(recibidas).toEqual([]);

    expect(await llamar<ErrorApi>('GET', '/pagos/point/cobros/ORD404')).toEqual({
      status: 422,
      cuerpo: { codigo: 'MERCADOPAGO_RECHAZO', mensaje: 'Mercado Pago rechazó la operación: Order not found' },
    });
  });

  it('solo el personal de caja usa las máquinas', async () => {
    const cliente = await fetch(`${apiUrl}/usuarios/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'cliente@rockstar.cl', password: 'cliente123' }),
    });
    const token = ((await cliente.json()) as SesionResponse).accessToken;
    expect((await llamar('GET', '/pagos/point/terminales', undefined, token)).status).toBe(403);
  });
});

describe('sin cuenta de Mercado Pago', () => {
  it('avisa que falta configurarla', async () => {
    const base = inject('apiUrl');
    const sesion = await fetch(`${base}/usuarios/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'vendedor@rockstar.cl', password: 'vendedor123' }),
    });
    const token = ((await sesion.json()) as SesionResponse).accessToken;

    const { status, cuerpo } = await llamar<ErrorApi>('GET', '/pagos/point/terminales', undefined, token, base);

    expect(status).toBe(503);
    expect(cuerpo.codigo).toBe('MERCADOPAGO_NO_CONFIGURADO');
  });
});
