import { randomUUID } from 'node:crypto';

import type { PGlite } from '@electric-sql/pglite';
import type { ComprobantePos, ErrorApi, LineaEnBodega, SesionResponse, VentaPosRequest } from '@rockstar/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { iniciarEntornoLocal } from './entorno-local.mjs';

/**
 * Pruebas de la venta en tienda (POS). Venden productos de demostración, así que levantan
 * siempre su propia API con base en memoria y nunca tocan la base de `docker compose`.
 *
 * La Polera Eddie M (variante 7, $15.990) parte con 9 unidades en bodega y 2 en sala.
 * La Polera Rayo L (variante 8, $14.990), con 5 y 1.
 */

const EDDIE = 7;
const RAYO = 8;

let apiUrl: string;
let db: PGlite;
let detener: () => Promise<void>;
let vendedor: string;
let gerente: string;
let bodega: string;
let cliente: string;

interface Respuesta<T> {
  status: number;
  cuerpo: T;
}

async function llamar<T>(metodo: string, ruta: string, cuerpo?: unknown, token?: string): Promise<Respuesta<T>> {
  const respuesta = await fetch(`${apiUrl}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as T };
}

async function iniciarSesion(email: string, password: string): Promise<string> {
  return (await llamar<SesionResponse>('POST', '/usuarios/auth/login', { email, password })).cuerpo.accessToken;
}

function vender<T = ComprobantePos>(datos: Partial<VentaPosRequest>, token = vendedor) {
  return llamar<T>('POST', '/ventas/pos', { claveIdempotencia: randomUUID(), medioPago: 'EFECTIVO', ...datos }, token);
}

const filas = async <T>(sql: string, parametros: unknown[] = []) => (await db.query<T>(sql, parametros)).rows;

async function existencias(idVariante: number): Promise<{ BODEGA: number; SALA_VENTAS: number }> {
  const resultado = await filas<{ nombre: 'BODEGA' | 'SALA_VENTAS'; cantidad: number }>(
    `SELECT u.nombre, e.cantidad FROM inventario.existencias e JOIN inventario.ubicaciones u USING (id_ubicacion)
     WHERE e.id_variante = $1`,
    [idVariante],
  );
  return Object.fromEntries(resultado.map((fila) => [fila.nombre, fila.cantidad])) as { BODEGA: number; SALA_VENTAS: number };
}

beforeAll(async () => {
  ({ apiUrl, db, detener } = await iniciarEntornoLocal({ silencioso: true }));
  vendedor = await iniciarSesion('vendedor@rockstar.cl', 'vendedor123');
  gerente = await iniciarSesion('gerente@rockstar.cl', 'gerente123');
  bodega = await iniciarSesion('bodega@rockstar.cl', 'bodega123');
  cliente = await iniciarSesion('cliente@rockstar.cl', 'cliente123');
});

afterAll(async () => {
  await detener?.();
});

describe('venta POS', () => {
  it('se registra pagada, sale de la sala de ventas y no cobra flete ni crea pedido', async () => {
    const antes = await existencias(EDDIE);

    const { status, cuerpo } = await vender({ lineas: [{ idVariante: EDDIE, cantidad: 1 }], medioPago: 'DEBITO_PRESENCIAL' });

    expect(status).toBe(201);
    expect(cuerpo).toMatchObject({
      vendedor: 'Vendedor Demo',
      cliente: null,
      medioPago: { codigo: 'DEBITO_PRESENCIAL', nombre: 'Tarjeta de débito' },
      total: 15990,
      lineas: [{ idVariante: EDDIE, sku: 'RS-0007', cantidad: 1, precioUnitario: 15990, subtotal: 15990, ubicacion: 'SALA_VENTAS' }],
    });
    expect(await existencias(EDDIE)).toEqual({ BODEGA: antes.BODEGA, SALA_VENTAS: antes.SALA_VENTAS - 1 });

    const [venta] = await filas<{ canal: string; estado: string; flete: number; pedidos: number; movimiento: string }>(
      `SELECT v.canal, e.codigo AS estado, c.flete_cobrado AS flete,
              (SELECT count(*)::int FROM logistica.pedidos p WHERE p.id_venta = v.id_venta) AS pedidos,
              (SELECT t.codigo FROM inventario.movimientos m JOIN inventario.tipos_movimiento t USING (id_tipo)
               WHERE m.id_venta = v.id_venta) AS movimiento
       FROM ventas.ventas v JOIN ventas.estados_venta e USING (id_estado) JOIN ventas.costos_venta c USING (id_venta)
       WHERE v.id_venta = $1`,
      [cuerpo.idVenta],
    );
    expect(venta).toEqual({ canal: 'POS', estado: 'PAGADA', flete: 0, pedidos: 0, movimiento: 'VENTA' });
  });

  it('pide permiso para retirar de bodega lo que no alcanza en sala, y con él reparte la línea', async () => {
    const antes = await existencias(RAYO);
    const cantidad = antes.SALA_VENTAS + 1;

    const sinPermiso = await vender<ErrorApi>({ lineas: [{ idVariante: RAYO, cantidad }] });
    expect(sinPermiso.status).toBe(409);
    expect(sinPermiso.cuerpo.codigo).toBe('EXISTENCIA_EN_BODEGA');
    expect(sinPermiso.cuerpo.detalle as LineaEnBodega[]).toEqual([
      { idVariante: RAYO, producto: 'Polera Rayo', talla: 'L', enSala: antes.SALA_VENTAS, enBodega: antes.BODEGA },
    ]);
    expect(await existencias(RAYO)).toEqual(antes);

    const conPermiso = await vender({ lineas: [{ idVariante: RAYO, cantidad, permitirBodega: true }] });
    expect(conPermiso.status).toBe(201);
    expect(conPermiso.cuerpo.lineas.map((l) => [l.ubicacion, l.cantidad])).toEqual([
      ['SALA_VENTAS', antes.SALA_VENTAS],
      ['BODEGA', 1],
    ]);
    expect(conPermiso.cuerpo.total).toBe(14990 * cantidad);
    expect(await existencias(RAYO)).toEqual({ BODEGA: antes.BODEGA - 1, SALA_VENTAS: 0 });
  });

  it('rechaza lo que no tiene stock sin vender nada', async () => {
    const antes = await existencias(EDDIE);

    const { status, cuerpo } = await vender<ErrorApi>({ lineas: [{ idVariante: EDDIE, cantidad: 999, permitirBodega: true }] });

    expect(status).toBe(409);
    expect(cuerpo.codigo).toBe('STOCK_INSUFICIENTE');
    expect(await existencias(EDDIE)).toEqual(antes);
  });

  it('se registra una sola vez aunque se confirme dos veces', async () => {
    const antes = await existencias(EDDIE);
    const datos = { claveIdempotencia: randomUUID(), lineas: [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }] };

    const [primera, segunda] = await Promise.all([vender(datos), vender(datos)]);

    expect(primera.cuerpo.idVenta).toBe(segunda.cuerpo.idVenta);
    const total = (await existencias(EDDIE));
    expect(total.BODEGA + total.SALA_VENTAS).toBe(antes.BODEGA + antes.SALA_VENTAS - 1);
  });

  it('anota al cliente identificado en el mostrador', async () => {
    const [{ id_usuario: idCliente }] = await filas<{ id_usuario: number }>(
      "SELECT id_usuario FROM usuarios.usuarios WHERE email = 'cliente@rockstar.cl'",
    );

    const { status, cuerpo } = await vender({ lineas: [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }], idCliente });

    expect(status).toBe(201);
    expect(cuerpo.cliente).toBe('Cliente Demo');
  });

  it('exige productos, un medio de pago presencial y un cliente válido', async () => {
    const lineas = [{ idVariante: EDDIE, cantidad: 1 }];
    expect((await vender<ErrorApi>({ lineas: [] })).status).toBe(400);
    expect((await vender<ErrorApi>({ lineas, medioPago: undefined })).status).toBe(400);
    expect((await vender<ErrorApi>({ lineas, medioPago: 'WEBPAY_DEBITO' as never })).status).toBe(400);
    expect((await vender<ErrorApi>({ lineas, idCliente: 1 })).status).toBe(400);
  });

  it('solo la registra un Vendedor', async () => {
    const lineas = [{ idVariante: EDDIE, cantidad: 1 }];
    expect((await vender<ErrorApi>({ lineas }, cliente)).status).toBe(403);
    expect((await vender<ErrorApi>({ lineas }, bodega)).status).toBe(403);
    expect((await vender<ErrorApi>({ lineas }, gerente)).status).toBe(403);
  });
});

describe('ventas POS del día', () => {
  it('el Vendedor ve las suyas con su comprobante, el Gerente todas y nadie más las consulta', async () => {
    const { cuerpo: venta } = await vender({ lineas: [{ idVariante: EDDIE, cantidad: 1, permitirBodega: true }], medioPago: 'CREDITO_PRESENCIAL' });

    const delVendedor = await llamar<ComprobantePos[]>('GET', '/ventas/pos', undefined, vendedor);
    expect(delVendedor.status).toBe(200);
    expect(delVendedor.cuerpo[0]).toEqual(venta);

    const delGerente = await llamar<ComprobantePos[]>('GET', '/ventas/pos', undefined, gerente);
    expect(delGerente.cuerpo.map((v) => v.idVenta)).toEqual(delVendedor.cuerpo.map((v) => v.idVenta));

    expect((await llamar<ErrorApi>('GET', '/ventas/pos', undefined, bodega)).status).toBe(403);
    expect((await llamar<ErrorApi>('GET', '/ventas/pos', undefined, cliente)).status).toBe(403);
  });
});
