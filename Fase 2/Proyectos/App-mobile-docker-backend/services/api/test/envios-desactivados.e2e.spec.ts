import { randomUUID } from 'node:crypto';

import type { PGlite } from '@electric-sql/pglite';
import type { CheckoutResponse, Comuna, CotizacionFlete, ErrorApi, PedidoCliente, ResultadoPago, SesionResponse } from '@rockstar/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { iniciarEntornoLocal } from './entorno-local.mjs';

/**
 * Tienda con los envíos apagados (`STARKEN_AMBIENTE=desactivado`), como en la web de prueba:
 * la compra no cobra flete y ningún pedido se despacha. Levanta su propia API con base en
 * memoria, porque necesita esa variable.
 *
 * La Polera Eddie M (variante 7, $15.990) parte con 9 unidades en bodega. El pedido de
 * demostración 1001 lleva una Polera Calavera L (variante 2), con 8 en bodega.
 */

const EDDIE = 7;

let apiUrl: string;
let db: PGlite;
let detener: () => Promise<void>;
let cliente: string;
let bodega: string;
let providencia: number;

async function llamar<T>(metodo: string, ruta: string, cuerpo?: unknown, token?: string): Promise<{ status: number; cuerpo: T }> {
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

const enviar = <T>(ruta: string, cuerpo: unknown, token?: string) => llamar<T>('POST', ruta, cuerpo, token);

async function iniciarSesion(email: string, password: string): Promise<string> {
  return (await enviar<SesionResponse>('/usuarios/auth/login', { email, password })).cuerpo.accessToken;
}

const enBodega = async (idVariante: number) =>
  (
    await db.query<{ cantidad: number }>(
      `SELECT e.cantidad FROM inventario.existencias e JOIN inventario.ubicaciones u USING (id_ubicacion)
       WHERE e.id_variante = $1 AND u.nombre = 'BODEGA'`,
      [idVariante],
    )
  ).rows[0]!.cantidad;

beforeAll(async () => {
  ({ apiUrl, db, detener } = await iniciarEntornoLocal({ silencioso: true, entorno: { STARKEN_AMBIENTE: 'desactivado', WEBPAY_AMBIENTE: 'simulada' } }));
  cliente = await iniciarSesion('cliente@rockstar.cl', 'cliente123');
  bodega = await iniciarSesion('bodega@rockstar.cl', 'bodega123');
  providencia = (await llamar<Comuna[]>('GET', '/logistica/comunas?region=7')).cuerpo.find((c) => c.nombre === 'Providencia')!.idComuna;
});

afterAll(async () => {
  await detener?.();
});

describe('envíos desactivados', () => {
  it('el flete vale cero y avisa que no hay despacho', async () => {
    expect((await enviar<CotizacionFlete>('/logistica/fletes/cotizar', { idComuna: providencia })).cuerpo).toEqual({
      idComuna: providencia,
      valor: 0,
      disponible: false,
    });
  });

  it('la compra se paga sin flete y el pedido queda pagado', async () => {
    const despacho = { idComuna: providencia, direccion: 'Av. Siempre Viva 742', destinatario: 'Cliente Demo', telefono: '+56 9 1234 5678' };
    const compra = (
      await enviar<CheckoutResponse>('/ventas/checkout', { claveIdempotencia: randomUUID(), lineas: [{ idVariante: EDDIE, cantidad: 1 }], despacho }, cliente)
    ).cuerpo;
    expect(compra).toMatchObject({ subtotal: 15990, flete: 0, total: 15990 });

    expect((await enviar<ResultadoPago>('/pagos/webpay/retorno', { tokenPago: compra.tokenPago, aprobar: true })).cuerpo.estado).toBe('PAGADA');

    const pedido = (await llamar<PedidoCliente[]>('GET', '/logistica/pedidos/mios', undefined, cliente)).cuerpo.find((p) => p.idVenta === compra.idVenta);
    expect(pedido).toMatchObject({ estado: 'PAGADO', flete: 0, total: 15990 });
    expect(pedido).not.toHaveProperty('trackingStarken');
  });

  it('no genera despachos y el stock queda como estaba', async () => {
    const antes = await enBodega(2);

    expect(await enviar<ErrorApi>('/logistica/pedidos/1001/despacho', undefined, bodega)).toEqual({
      status: 409,
      cuerpo: {
        codigo: 'DESPACHO_DESACTIVADO',
        mensaje: 'Los envíos por Starken están desactivados por ahora: el pedido queda pagado y no se despacha.',
      },
    });
    expect(await enBodega(2)).toBe(antes);
  });
});
