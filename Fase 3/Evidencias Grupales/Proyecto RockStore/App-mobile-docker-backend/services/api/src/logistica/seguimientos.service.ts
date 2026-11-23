import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { EstadoSeguimiento, EventoSeguimiento, SeguimientoEnvio, Usuario } from '@rockstar/contracts';

import { accesoDenegado, noEncontrado } from '../comun/errores.js';
import { CONFIGURACION, type Configuracion } from '../config.js';
import { BaseDeDatos } from '../db/base-de-datos.js';
import { type SeguimientoTransportista, TRANSPORTISTA, type Transportista } from './transportista.js';

interface PedidoConSeguimiento {
  id_pedido: number;
  id_cliente: number;
  tracking_starken: string;
  despachado_en: Date | null;
  seguimiento_estado: EstadoSeguimiento | null;
  seguimiento_actualizado_en: Date | null;
}

const ID_ENTREGADO = `(SELECT id_estado FROM logistica.estados_pedido WHERE codigo = 'ENTREGADO')`;
const PUEDE_VER_CUALQUIERA = new Set(['VENDEDOR', 'BODEGA', 'GERENTE']);

const SELECCION = `
  SELECT pe.id_pedido, ve.id_cliente, pe.tracking_starken, pe.despachado_en,
         pe.seguimiento_estado, pe.seguimiento_actualizado_en
  FROM logistica.pedidos pe
  JOIN ventas.ventas ve ON ve.id_venta = pe.id_venta`;

/** Consulta y sincroniza lo que informa Starken sobre los envíos ya despachados. */
@Injectable()
export class SeguimientosService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Seguimientos');
  private temporizador?: NodeJS.Timeout;

  constructor(
    private readonly db: BaseDeDatos,
    @Inject(TRANSPORTISTA) private readonly transportista: Transportista,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  onModuleInit(): void {
    this.temporizador = setInterval(() => {
      this.sincronizar().catch((error) => this.log.error(error instanceof Error ? (error.stack ?? error.message) : String(error)));
    }, this.configuracion.starken.sincronizacionMs);
    this.temporizador.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.temporizador);
  }

  /** Un cliente solo ve su envío; el personal ve cualquiera. Nunca se expone la dirección. */
  async consultar(codigo: string, usuario: Usuario): Promise<SeguimientoEnvio> {
    const [pedido] = await this.db.consultar<PedidoConSeguimiento>(`${SELECCION} WHERE pe.tracking_starken = $1`, [codigo]);
    if (!pedido) {
      throw noEncontrado('El envío no existe.');
    }
    if (!PUEDE_VER_CUALQUIERA.has(usuario.rol) && pedido.id_cliente !== usuario.id) {
      throw accesoDenegado();
    }

    let estado = pedido.seguimiento_estado;
    let actualizadoEn = pedido.seguimiento_actualizado_en?.toISOString();
    try {
      const informado = await this.transportista.consultarSeguimiento(codigo, pedido.despachado_en ?? new Date());
      await this.registrar(pedido, informado);
      estado = informado.estado;
      actualizadoEn = new Date().toISOString();
    } catch (error) {
      // Sin red se muestra el último estado conocido; sin estado local, el fallo se informa.
      if (!estado) {
        throw error;
      }
      this.log.warn(`No se pudo actualizar el envío ${codigo}: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      codigo,
      estado: estado!,
      eventos: await this.eventos(codigo),
      actualizadoEn: actualizadoEn ?? new Date().toISOString(),
    };
  }

  /** Consulta los envíos pendientes y guarda lo nuevo. Los bloqueos evitan trabajo duplicado entre réplicas. */
  async sincronizar(): Promise<void> {
    const pedidos = await this.db.consultar<PedidoConSeguimiento>(
      `${SELECCION}
       JOIN logistica.estados_pedido es ON es.id_estado = pe.id_estado
       WHERE pe.tracking_starken IS NOT NULL AND pe.despachado_en IS NOT NULL AND es.codigo <> 'ENTREGADO'
       FOR UPDATE OF pe SKIP LOCKED`,
    );
    for (const pedido of pedidos) {
      try {
        const informado = await this.transportista.consultarSeguimiento(pedido.tracking_starken, pedido.despachado_en!);
        await this.registrar(pedido, informado);
      } catch (error) {
        this.log.warn(`No se pudo sincronizar el envío ${pedido.tracking_starken}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async eventos(codigo: string): Promise<EventoSeguimiento[]> {
    const filas = await this.db.consultar<{ estado: EstadoSeguimiento; descripcion: string; fecha: Date }>(
      `SELECT estado, descripcion, fecha_evento AS fecha FROM logistica.seguimiento_eventos
       WHERE codigo = $1 ORDER BY fecha_evento, id`,
      [codigo],
    );
    return filas.map((fila) => ({ ...fila, fecha: fila.fecha.toISOString() }));
  }

  private async registrar(pedido: PedidoConSeguimiento, informado: SeguimientoTransportista): Promise<void> {
    for (const evento of informado.eventos) {
      await this.db.consultar(
        `INSERT INTO logistica.seguimiento_eventos (codigo, estado, descripcion, fecha_evento)
         VALUES ($1, $2, $3, $4) ON CONFLICT (codigo, estado, fecha_evento) DO NOTHING`,
        [informado.codigo, evento.estado, evento.descripcion, evento.fecha],
      );
    }
    await this.db.consultar(
      `UPDATE logistica.pedidos SET seguimiento_estado = $2, seguimiento_actualizado_en = now()
       WHERE tracking_starken = $1`,
      [informado.codigo, informado.estado],
    );
    if (informado.estado === 'ENTREGADO') {
      await this.marcarEntregado(pedido.id_pedido);
    }
  }

  /** Solo cambia una vez: el `RETURNING` evita duplicar el evento en el historial. */
  private async marcarEntregado(idPedido: number): Promise<void> {
    const [cambiado] = await this.db.consultar<{ id_pedido: number }>(
      `UPDATE logistica.pedidos pe SET id_estado = ${ID_ENTREGADO}, entregado_en = now()
       WHERE pe.id_pedido = $1 AND (SELECT codigo FROM logistica.estados_pedido WHERE id_estado = pe.id_estado) <> 'ENTREGADO'
       RETURNING pe.id_pedido`,
      [idPedido],
    );
    if (cambiado) {
      await this.db.consultar(
        `INSERT INTO logistica.historial_pedido (id_pedido, id_estado, id_usuario)
         VALUES ($1, ${ID_ENTREGADO}, COALESCE(
           (SELECT id_usuario FROM logistica.historial_pedido WHERE id_pedido = $1 ORDER BY fecha DESC LIMIT 1),
           (SELECT min(id_usuario) FROM usuarios.usuarios)))`,
        [idPedido],
      );
    }
  }
}
