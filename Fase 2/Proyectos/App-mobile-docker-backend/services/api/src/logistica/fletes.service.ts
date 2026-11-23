import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CotizacionFlete, LineaCotizacion } from '@rockstar/contracts';

import { ErrorDeNegocio, cuerpoComo, datosInvalidos, esEnteroPositivo, exigir } from '../comun/errores.js';
import { CONFIGURACION, type Configuracion } from '../config.js';
import type { Ejecutor } from '../db/base-de-datos.js';
import { type DestinoDeFlete, TRANSPORTISTA, type Transportista } from './transportista.js';

interface DestinoFila {
  comuna: string;
  region: string;
  zona: 'SANTIAGO' | 'REGIONES';
  codigo_starken: string | null;
}

interface Medidas {
  peso: number;
  volumen: number;
}

interface Tarifa {
  valor: number;
}

/** Cotización del flete a una comuna. La usan la tienda, para mostrarlo, y el checkout, para cobrarlo. */
@Injectable()
export class FletesService {
  private readonly log = new Logger('Fletes');

  constructor(
    @Inject(TRANSPORTISTA) private readonly transportista: Transportista,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  async cotizar(ejecutor: Ejecutor, idComuna: unknown, lineas: unknown = []): Promise<CotizacionFlete> {
    if (!Number.isInteger(idComuna)) {
      throw datosInvalidos('La comuna no existe.');
    }
    const id = idComuna as number;
    const [destino] = await ejecutor.consultar<DestinoFila>(
      `SELECT co.nombre AS comuna, re.nombre AS region, co.zona, co.codigo_starken
       FROM logistica.comunas co JOIN logistica.regiones re ON re.id_region = co.id_region
       WHERE co.id_comuna = $1`,
      [id],
    );
    if (!destino) {
      throw datosInvalidos('La comuna no existe.');
    }

    const medidas = await this.medidas(ejecutor, this.lineasValidas(lineas));
    const { tramoPeso, tramoVolumen } = this.tramos(medidas);
    const destinoDeFlete: DestinoDeFlete = {
      comuna: destino.comuna,
      region: destino.region,
      zona: destino.zona,
      codigoStarken: destino.codigo_starken,
      pesoGramos: medidas.peso,
      volumenCm3: medidas.volumen,
      tramoPeso,
      tramoVolumen,
    };

    // Con los envíos apagados el flete vale cero y no se guarda en la caché de tarifas.
    if (!this.transportista.activo) {
      return { idComuna: id, valor: 0, disponible: false };
    }

    let valor: number;
    try {
      valor = await this.transportista.cotizar(destinoDeFlete);
      await ejecutor.consultar(
        `INSERT INTO logistica.tarifas_cache (id_comuna, tramo_peso, tramo_volumen, valor)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id_comuna, tramo_peso, tramo_volumen)
         DO UPDATE SET valor = EXCLUDED.valor, consultado_en = now()`,
        [id, tramoPeso, tramoVolumen, valor],
      );
    } catch (error) {
      if (error instanceof ErrorDeNegocio && error.codigo === 'SIN_COBERTURA') {
        throw error;
      }
      this.log.warn(
        `No se pudo cotizar el flete a ${destino.comuna}: ${error instanceof Error ? error.message : String(error)}`,
      );
      valor = await this.respaldo(ejecutor, destino.zona, tramoPeso, tramoVolumen, id);
    }
    return { idComuna: id, valor, disponible: true };
  }

  /** Las líneas que llegan al cotizador: solo importan la variante y la cantidad. */
  private lineasValidas(lineas: unknown): LineaCotizacion[] {
    if (lineas === undefined || lineas === null) {
      return [];
    }
    exigir(Array.isArray(lineas), 'Las líneas del carrito no son válidas.');
    return (lineas as unknown[]).map((linea) => {
      const datos = cuerpoComo<LineaCotizacion>(linea);
      exigir(
        esEnteroPositivo(datos.idVariante) && esEnteroPositivo(datos.cantidad),
        'Cada línea del carrito necesita una variante y una cantidad mayor que cero.',
      );
      return { idVariante: datos.idVariante!, cantidad: datos.cantidad! };
    });
  }

  /** Peso y volumen totales del carrito, calculados en la base con los datos del catálogo. */
  private async medidas(ejecutor: Ejecutor, lineas: LineaCotizacion[]): Promise<Medidas> {
    if (lineas.length === 0) {
      return { peso: 0, volumen: 0 };
    }
    const [medidas] = await ejecutor.consultar<Medidas>(
      `SELECT COALESCE(sum(COALESCE(p.peso_gramos, 0) * l.cantidad), 0)::int AS peso,
              COALESCE(sum(COALESCE(p.alto_cm, 0) * COALESCE(p.ancho_cm, 0) * COALESCE(p.largo_cm, 0)
                           * l.cantidad), 0)::int AS volumen
       FROM unnest($1::int[], $2::int[]) AS l(id_variante, cantidad)
       JOIN inventario.variantes v ON v.id_variante = l.id_variante
       JOIN inventario.productos p ON p.id_producto = v.id_producto`,
      [
        lineas.map((linea) => linea.idVariante),
        lineas.map((linea) => linea.cantidad),
      ],
    );
    return medidas ?? { peso: 0, volumen: 0 };
  }

  private tramos(medidas: Medidas): { tramoPeso: number; tramoVolumen: number } {
    const { tramoPesoGramos, tramoVolumenCm3 } = this.configuracion.starken;
    return {
      tramoPeso: Math.max(1, Math.ceil(medidas.peso / tramoPesoGramos)),
      tramoVolumen: Math.max(1, Math.ceil(medidas.volumen / tramoVolumenCm3)),
    };
  }

  /** Última tarifa conocida o, si no hay, la de respaldo de la zona. */
  private async respaldo(
    ejecutor: Ejecutor,
    zona: 'SANTIAGO' | 'REGIONES',
    tramoPeso: number,
    tramoVolumen: number,
    idComuna: number,
  ): Promise<number> {
    // Con el proveedor caído se usa la última tarifa aunque esté vencida.
    const [cache] = await ejecutor.consultar<Tarifa>(
      `SELECT valor FROM logistica.tarifas_cache
       WHERE id_comuna = $1 AND tramo_peso = $2 AND tramo_volumen = $3`,
      [idComuna, tramoPeso, tramoVolumen],
    );
    if (cache) {
      return cache.valor;
    }
    const [respaldo] = await ejecutor.consultar<Tarifa>(
      'SELECT valor FROM logistica.tarifas_respaldo WHERE zona = $1 AND tramo_peso = $2',
      [zona, tramoPeso],
    );
    if (respaldo) {
      return respaldo.valor;
    }
    throw new ErrorDeNegocio(
      503,
      'TRANSPORTISTA_NO_DISPONIBLE',
      'No se pudo calcular el despacho. Reintenta en unos minutos.',
    );
  }
}
