import { Controller, Get, Inject } from '@nestjs/common';

import { Publica } from './auth/decoradores.js';
import { CONFIGURACION, type Configuracion } from './config.js';
import { BaseDeDatos } from './db/base-de-datos.js';

/**
 * Verificación de vida para Docker y para quien despliega: responde solo si la base contesta.
 * Si se conoce el commit en ejecución, lo informa, para que el pipeline sepa que la versión
 * nueva ya quedó arriba.
 */
@Publica()
@Controller('salud')
export class SaludController {
  constructor(
    private readonly db: BaseDeDatos,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  @Get()
  async salud(): Promise<{ estado: 'ok'; version?: string }> {
    await this.db.consultar('SELECT 1');
    const { version } = this.configuracion;
    return { estado: 'ok', ...(version ? { version } : {}) };
  }
}
