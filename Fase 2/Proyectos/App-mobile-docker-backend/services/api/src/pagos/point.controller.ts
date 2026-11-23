import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { CobroTerminal, TerminalPoint } from '@rockstar/contracts';

import { Roles } from '../auth/decoradores.js';
import { PointService } from './point.service.js';

/**
 * Máquinas de cobro Mercado Pago Point para el POS. La caja no habla con Mercado Pago:
 * le pide a la API, que tiene el access token, que active la máquina y cobre en ella.
 */
@Controller('pagos/point')
@Roles('VENDEDOR', 'GERENTE')
export class PointController {
  constructor(private readonly point: PointService) {}

  @Get('terminales')
  terminales(): Promise<TerminalPoint[]> {
    return this.point.terminales();
  }

  /** Pone la máquina en modo PDV, para que reciba los cobros de la caja. */
  @Post('terminales/:id/activar')
  @HttpCode(200)
  activar(@Param('id') id: string): Promise<TerminalPoint> {
    return this.point.activar(id);
  }

  @Post('cobros')
  cobrar(@Body() cuerpo: unknown): Promise<CobroTerminal> {
    return this.point.cobrar(cuerpo);
  }

  @Get('cobros/:id')
  consultar(@Param('id') id: string): Promise<CobroTerminal> {
    return this.point.consultar(id);
  }

  @Post('cobros/:id/cancelar')
  @HttpCode(200)
  cancelar(@Param('id') id: string): Promise<CobroTerminal> {
    return this.point.cancelar(id);
  }

  @Post('cobros/:id/anular')
  @HttpCode(200)
  anular(@Param('id') id: string): Promise<CobroTerminal> {
    return this.point.anular(id);
  }
}
