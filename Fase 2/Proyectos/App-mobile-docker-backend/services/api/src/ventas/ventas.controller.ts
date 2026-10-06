import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { CheckoutResponse, CompraPendiente, ComprobantePos, ResultadoPago, Usuario } from '@rockstar/contracts';

import { Publica, Roles, UsuarioActual } from '../auth/decoradores.js';
import { ComprasService } from './compras.service.js';
import { VentasPosService } from './ventas-pos.service.js';

/**
 * Compra web y venta en tienda. En el diseño el checkout es de Ventas y el retorno del pago
 * es de Pagos; aquí comparten controlador porque en este servicio único los resuelve la misma saga.
 */
@Controller()
export class VentasController {
  constructor(
    private readonly compras: ComprasService,
    private readonly pos: VentasPosService,
  ) {}

  /** Registra una venta en la tienda, descuenta el stock y devuelve el comprobante. Exige sesión de Vendedor. */
  @Post('ventas/pos')
  @Roles('VENDEDOR')
  registrarPos(@Body() cuerpo: unknown, @UsuarioActual() vendedor: Usuario): Promise<ComprobantePos> {
    return this.pos.registrar(cuerpo, vendedor);
  }

  /** Comprobantes de las ventas POS del día: las propias del Vendedor, o todas para el Gerente. */
  @Get('ventas/pos')
  @Roles('VENDEDOR', 'GERENTE')
  ventasPos(@UsuarioActual() usuario: Usuario): Promise<ComprobantePos[]> {
    return this.pos.delDia(usuario);
  }

  /** Crea la compra, reserva las unidades e inicia el pago. Exige sesión de Cliente. */
  @Post('ventas/checkout')
  @Roles('CLIENTE')
  checkout(@Body() cuerpo: unknown, @UsuarioActual() cliente: Usuario): Promise<CheckoutResponse> {
    return this.compras.iniciar(cuerpo, cliente);
  }

  /** Las compras de quien consulta que aún esperan su pago, de la más reciente a la más antigua. */
  @Get('ventas/pendientes')
  @Roles('CLIENTE')
  pendientes(@UsuarioActual() cliente: Usuario): Promise<CompraPendiente[]> {
    return this.compras.pendientesDe(cliente);
  }

  /**
   * Retorno desde la pasarela. Es público porque quien llega es el navegador redirigido,
   * y lo que identifica el pago es su token.
   */
  @Post('pagos/webpay/retorno')
  @Publica()
  @HttpCode(200)
  retorno(@Body() cuerpo: unknown): Promise<ResultadoPago> {
    return this.compras.resolverPago(cuerpo);
  }
}
