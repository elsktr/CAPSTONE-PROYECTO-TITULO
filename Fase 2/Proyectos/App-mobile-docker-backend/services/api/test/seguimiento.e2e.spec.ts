import { randomUUID } from 'node:crypto';

import type { PGlite } from '@electric-sql/pglite';
import type { ErrorApi, SeguimientoEnvio, SesionResponse } from '@rockstar/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { iniciarEntornoLocal } from './entorno-local.mjs';

/**
 * Seguimiento de los envíos ya despachados. Levanta su propia API con base en memoria,
 * sin tocar la base de `docker compose`. Los pedidos 1004 y 1005 salieron hace 22 y 50
 * horas: con el doble de Starken, uno va en tránsito y el otro ya está entregado.
 */

let apiUrl: string;
let db: PGlite;
let detener: () => Promise<void>;
let bodega: string;
let vendedor: string;
let gerente: string;
let cliente: string;
let ajeno: string;

interface Respuesta<T> {
  status: number;
  cuerpo: T;
}

async function llamar<T>(ruta: string, token?: string): Promise<Respuesta<T>> {
  const respuesta = await fetch(`${apiUrl}${ruta}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: respuesta.status, cuerpo: (await respuesta.json()) as T };
}

const seguir = (codigo: string, token: string) => llamar<SeguimientoEnvio | ErrorApi>(`/logistica/envios/${codigo}`, token);

async function iniciarSesion(email: string, password: string): Promise<string> {
  const respuesta = await fetch(`${apiUrl}/usuarios/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return ((await respuesta.json()) as SesionResponse).accessToken;
}

const filas = async <T>(sql: string, parametros: unknown[] = []) => (await db.query<T>(sql, parametros)).rows;

const horasAtras = (horas: number) => new Date(Date.now() - horas * 3_600_000).toISOString();

beforeAll(async () => {
  ({ apiUrl, db, detener } = await iniciarEntornoLocal({ silencioso: true }));
  bodega = await iniciarSesion('bodega@rockstar.cl', 'bodega123');
  vendedor = await iniciarSesion('vendedor@rockstar.cl', 'vendedor123');
  gerente = await iniciarSesion('gerente@rockstar.cl', 'gerente123');
  cliente = await iniciarSesion('cliente@rockstar.cl', 'cliente123');
  const registro = await fetch(`${apiUrl}/usuarios/auth/registro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: 'Otro Cliente',
      email: `otro-${randomUUID().slice(0, 8)}@correo.cl`,
      password: 'guitarra-8',
      telefono: '+56 9 1234 5678',
      direccion: 'Av. Siempre Viva 742',
    }),
  });
  ajeno = ((await registro.json()) as SesionResponse).accessToken;
});

afterAll(async () => {
  await detener?.();
});

describe('consulta de seguimiento', () => {
  it('muestra el estado y los eventos sin exponer dirección ni teléfono', async () => {
    const { status, cuerpo } = await seguir('STK-900104', bodega);

    expect(status).toBe(200);
    expect(cuerpo).toMatchObject({
      codigo: 'STK-900104',
      estado: 'EN_TRANSITO',
      eventos: [
        { estado: 'PREPARADO', descripcion: 'El envío está siendo preparado', fecha: expect.any(String) },
        { estado: 'EN_TRANSITO', descripcion: 'El envío está en tránsito', fecha: expect.any(String) },
      ],
      actualizadoEn: expect.any(String),
    });
    expect(cuerpo).not.toHaveProperty('direccion');
    expect(cuerpo).not.toHaveProperty('telefono');
    expect(cuerpo).not.toHaveProperty('destinatario');
    expect(cuerpo).not.toHaveProperty('idPedido');
  });

  it('avisa cuando el código de seguimiento no existe', async () => {
    expect(await seguir('STK-999999', bodega)).toEqual({
      status: 404,
      cuerpo: { codigo: 'NO_ENCONTRADO', mensaje: 'El envío no existe.' },
    });
  });

  it('un Cliente ve solo su envío; Vendedor, Bodega y Gerente ven cualquiera', async () => {
    expect((await seguir('STK-900104', cliente)).status).toBe(200);
    expect(await seguir('STK-900104', ajeno)).toEqual({
      status: 403,
      cuerpo: { codigo: 'ACCESO_DENEGADO', mensaje: 'El rol no tiene permiso para esta operación.' },
    });
    for (const token of [vendedor, gerente]) {
      expect((await seguir('STK-900104', token)).status).toBe(200);
    }
  });

  it('conserva el último estado conocido si el proveedor falla al consultar', async () => {
    // Un código con formato inválido hace fallar al proveedor simulado, como lo haría una caída de red.
    await db.query(
      `UPDATE logistica.pedidos SET tracking_starken = 'NO-VALIDO', seguimiento_estado = 'EN_TRANSITO', seguimiento_actualizado_en = now()
       WHERE id_pedido = 1004`,
    );
    await db.query(
      `INSERT INTO logistica.seguimiento_eventos (codigo, estado, descripcion, fecha_evento)
       VALUES ('NO-VALIDO', 'EN_TRANSITO', 'Último estado conocido', now())`,
    );

    expect(await seguir('NO-VALIDO', bodega)).toMatchObject({
      status: 200,
      cuerpo: { codigo: 'NO-VALIDO', estado: 'EN_TRANSITO', eventos: [{ descripcion: 'Último estado conocido' }] },
    });
  });

  it('al avanzar el reloj del doble el pedido pasa a entregado una sola vez', async () => {
    await db.query('UPDATE logistica.pedidos SET despachado_en = $1, tracking_starken = $2 WHERE id_pedido = 1005', [
      horasAtras(8),
      'STK-900105',
    ]);
    expect((await seguir('STK-900105', bodega)).cuerpo).toMatchObject({ estado: 'EN_TRANSITO' });

    // Se reinicia la línea de tiempo del doble: los eventos anteriores ya no corresponden.
    await db.query('DELETE FROM logistica.seguimiento_eventos WHERE codigo = $1', ['STK-900105']);
    await db.query('UPDATE logistica.pedidos SET despachado_en = $1 WHERE id_pedido = 1005', [horasAtras(30)]);

    expect((await seguir('STK-900105', bodega)).cuerpo).toMatchObject({
      estado: 'ENTREGADO',
      eventos: [
        { estado: 'PREPARADO' },
        { estado: 'EN_TRANSITO' },
        { estado: 'ENTREGADO', descripcion: 'El envío fue entregado' },
      ],
    });
    expect((await filas<{ codigo: string }>(
      `SELECT es.codigo FROM logistica.pedidos pe
       JOIN logistica.estados_pedido es ON es.id_estado = pe.id_estado WHERE pe.id_pedido = 1005`,
    ))[0]!.codigo).toBe('ENTREGADO');

    const historial = () => filas<{ total: number }>(
      `SELECT count(*)::int AS total FROM logistica.historial_pedido h
       JOIN logistica.estados_pedido es ON es.id_estado = h.id_estado
       WHERE h.id_pedido = 1005 AND es.codigo = 'ENTREGADO'`,
    );
    expect(await historial()).toEqual([{ total: 1 }]);
    await seguir('STK-900105', bodega);
    expect(await historial()).toEqual([{ total: 1 }]);
  });
});
