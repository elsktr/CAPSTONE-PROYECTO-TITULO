import { Injectable } from '@nestjs/common';
import type { CanalVenta, VentaResumen } from '@rockstar/contracts';

import { exigir } from '../comun/errores.js';
import { BaseDeDatos } from '../db/base-de-datos.js';

interface FilaVenta {
  id_venta: number;
  fecha: Date;
  canal: CanalVenta;
  total: number;
  flete: number;
  unidades: number;
  cliente: string | null;
  vendedor: string | null;
  medio_pago: string | null;
}

/** Ventas pagadas de la tienda web y del POS, juntas, para la vista de Finanzas del Gerente. */
@Injectable()
export class ResumenVentasService {
  constructor(private readonly db: BaseDeDatos) {}

  async pagadas(desde?: string): Promise<VentaResumen[]> {
    exigir(desde === undefined || desde === '' || /^\d{4}-\d{2}-\d{2}$/.test(desde), 'La fecha debe tener el formato AAAA-MM-DD.');
    const filas = await this.db.consultar<FilaVenta>(
      `SELECT ve.id_venta, ve.fecha, ve.canal, ve.total,
              COALESCE(cv.flete_cobrado, 0) AS flete,
              COALESCE((SELECT sum(d.cantidad) FROM ventas.detalle_venta d WHERE d.id_venta = ve.id_venta), 0)::int AS unidades,
              cl.nombre AS cliente, vd.nombre AS vendedor,
              (SELECT mp.nombre FROM pagos.transacciones t JOIN pagos.medios_pago mp ON mp.id_medio = t.id_medio
               WHERE t.id_venta = ve.id_venta AND t.estado = 'AUTORIZADA'
               ORDER BY t.id_transaccion DESC LIMIT 1) AS medio_pago
       FROM ventas.ventas ve
       JOIN ventas.estados_venta ev ON ev.id_estado = ve.id_estado AND ev.codigo = 'PAGADA'
       LEFT JOIN ventas.costos_venta cv ON cv.id_venta = ve.id_venta
       LEFT JOIN usuarios.usuarios cl ON cl.id_usuario = ve.id_cliente
       LEFT JOIN usuarios.usuarios vd ON vd.id_usuario = ve.id_vendedor
       WHERE $1::date IS NULL OR (ve.fecha AT TIME ZONE 'America/Santiago')::date >= $1::date
       ORDER BY ve.fecha DESC, ve.id_venta DESC`,
      [desde ? desde : null],
    );
    return filas.map((fila) => ({
      idVenta: fila.id_venta,
      fecha: fila.fecha.toISOString(),
      canal: fila.canal,
      total: fila.total,
      flete: fila.flete,
      unidades: fila.unidades,
      cliente: fila.cliente,
      vendedor: fila.vendedor,
      medioPago: fila.medio_pago,
    }));
  }
}
