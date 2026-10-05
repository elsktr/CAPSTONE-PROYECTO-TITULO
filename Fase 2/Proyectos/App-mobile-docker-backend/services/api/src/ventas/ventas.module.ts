import { Module } from '@nestjs/common';

import { InventarioModule } from '../inventario/inventario.module.js';
import { LogisticaModule } from '../logistica/logistica.module.js';
import { PagosModule } from '../pagos/pagos.module.js';
import { ComprasService } from './compras.service.js';
import { VentasController } from './ventas.controller.js';

@Module({
  imports: [InventarioModule, LogisticaModule, PagosModule],
  controllers: [VentasController],
  providers: [ComprasService],
})
export class VentasModule {}
