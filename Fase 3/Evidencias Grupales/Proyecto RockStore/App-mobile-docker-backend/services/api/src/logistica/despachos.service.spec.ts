import type { Usuario } from '@rockstar/contracts';
import { describe, expect, it, vi } from 'vitest';

import { leerConfiguracion } from '../config.js';
import { BaseDeDatos, type Ejecutor } from '../db/base-de-datos.js';
import { StockService } from '../inventario/stock.service.js';
import { DespachosService } from './despachos.service.js';
import type { DespachoEmitido, Transportista } from './transportista.js';

const usuario: Usuario = { id: 2, nombre: 'Bodega', email: 'bodega@rockstar.cl', rol: 'BODEGA' };
const BASE = { DATABASE_URL: 'postgres://postgres:postgres@localhost/postgres' };

/** Base y proveedor falsos: lo suficiente para ejercitar la transacción sin PostgreSQL. */
function montar(emitir: ReturnType<typeof vi.fn>) {
  const pedido = {
    id_pedido: 1001,
    id_venta: 5001,
    estado: 'EN_PREPARACION',
    destinatario: 'Camila Rojas',
    direccion: 'Av. Providencia 1234',
    comuna: 'Providencia',
    region: 'Región Metropolitana',
    lineas: [{ idVariante: 2, sku: 'RS-0002', producto: 'Polera Calavera', talla: 'L', color: 'Negro', cantidad: 1 }],
    pagado_en: new Date('2026-01-01T00:00:00Z'),
    despachado_en: null as Date | null,
    entregado_en: null,
    tracking_starken: null as string | null,
  };
  const pendientes: { id_pedido: number; id_usuario: number; intentos: number }[] = [];

  const consultar = vi.fn(async (sql: string, parametros: unknown[] = []) => {
    if (sql.includes('SELECT id_pedido FROM logistica.pedidos WHERE id_pedido')) {
      return [{ id_pedido: parametros[0] }];
    }
    if (sql.includes('SELECT pe.id_venta, es.codigo AS estado')) {
      return [
        {
          id_venta: 5001,
          estado: pedido.estado,
          venta_pagada: true,
          destinatario: pedido.destinatario,
          direccion: pedido.direccion,
          telefono: null,
          comuna: pedido.comuna,
          region: pedido.region,
          flete_cobrado: 4990,
        },
      ];
    }
    if (sql.includes('SELECT d.id_variante, v.sku')) {
      return [{ id_variante: 2, sku: 'RS-0002', cantidad: 1 }];
    }
    if (sql.includes('INSERT INTO logistica.despachos_pendientes')) {
      const actual = pendientes.find((pendiente) => pendiente.id_pedido === parametros[0]);
      if (actual) {
        actual.intentos += 1;
        actual.id_usuario = parametros[2] as number;
      } else {
        pendientes.push({ id_pedido: parametros[0] as number, id_usuario: parametros[2] as number, intentos: 1 });
      }
    } else if (sql.includes('SELECT id_pedido, id_usuario FROM logistica.despachos_pendientes')) {
      return pendientes;
    } else if (sql.includes('DELETE FROM logistica.despachos_pendientes')) {
      pendientes.length = 0;
    } else if (sql.includes('SELECT pe.id_pedido, pe.id_venta, es.codigo AS estado')) {
      return [pedido];
    }
    return [];
  });

  const ejecutor: Ejecutor = { consultar: consultar as unknown as Ejecutor['consultar'] };
  const db = {
    consultar,
    transaccion: vi.fn(async (operacion: (tx: Ejecutor) => Promise<unknown>) => operacion(ejecutor)),
  } as unknown as BaseDeDatos;
  const sumar = vi.fn();
  const stock = {
    bloquear: vi.fn(async () => new Map([[2, { existencias: { BODEGA: 5, SALA_VENTAS: 0 }, reservado: 0 }]])),
    sumar,
    registrar: vi.fn(),
  } as unknown as StockService;
  const transportista = { emitirDespacho: emitir } as unknown as Transportista;
  const servicio = new DespachosService(db, stock, transportista, leerConfiguracion(BASE));

  const exito = async (): Promise<DespachoEmitido> => {
    pedido.estado = 'DESPACHADO';
    pedido.despachado_en = new Date();
    pedido.tracking_starken = 'STK-901001';
    return { seguimiento: 'STK-901001', costo: 4990 };
  };

  return { servicio, pedido, pendientes, consultar, sumar, exito };
}

describe('emisión idempotente de despachos', () => {
  it('reintentar un despacho no emite otra orden ni descuenta dos veces el stock', async () => {
    const emitir = vi.fn();
    const { servicio, sumar, exito } = montar(emitir);
    emitir.mockImplementation(exito);

    await servicio.generar(1001, usuario);
    await servicio.generar(1001, usuario);

    expect(emitir).toHaveBeenCalledTimes(1);
    expect(emitir).toHaveBeenCalledWith(expect.objectContaining({ referencia: 1001, idempotencia: 'RS-1001' }));
    expect(sumar).toHaveBeenCalledTimes(1);
  });

  it('un fallo del proveedor queda pendiente y se reintenta con el mismo usuario y clave', async () => {
    const emitir = vi.fn().mockRejectedValueOnce(new Error('Starken caído'));
    const { servicio, pedido, pendientes, sumar, exito } = montar(emitir);

    await expect(servicio.generar(1001, usuario)).rejects.toMatchObject({
      status: 503,
      codigo: 'TRANSPORTISTA_NO_DISPONIBLE',
    });
    expect(pendientes).toMatchObject([{ id_pedido: 1001, id_usuario: 2, intentos: 1 }]);

    // La transacción fallida se deshizo en la base real; se descarta su movimiento simulado.
    sumar.mockClear();
    emitir.mockImplementationOnce(exito);

    await servicio.reintentarPendientes();

    expect(emitir).toHaveBeenCalledTimes(2);
    expect(emitir.mock.calls.map((llamada) => (llamada[0] as { idempotencia: string }).idempotencia)).toEqual(['RS-1001', 'RS-1001']);
    expect(sumar).toHaveBeenCalledTimes(1);
    expect(pendientes).toEqual([]);
    expect(pedido.estado).toBe('DESPACHADO');
  });
});
