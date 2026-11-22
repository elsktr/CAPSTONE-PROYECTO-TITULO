import { Module } from '@nestjs/common';

import { CONFIGURACION } from '../config.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { DespachosService } from './despachos.service.js';
import { DestinosController } from './destinos.controller.js';
import { FletesService } from './fletes.service.js';
import { PedidosController } from './pedidos.controller.js';
import { transportistaPara } from './proveedor.js';
import { SeguimientosService } from './seguimientos.service.js';
import { TRANSPORTISTA } from './transportista.js';

@Module({
  imports: [InventarioModule],
  controllers: [DestinosController, PedidosController],
  // El ambiente de la configuración decide entre el doble determinista y la API REST.
  providers: [
    DespachosService,
    FletesService,
    SeguimientosService,
    { provide: TRANSPORTISTA, inject: [CONFIGURACION], useFactory: transportistaPara },
  ],
  // El checkout cobra el flete que cotiza Logística.
  exports: [FletesService],
})
export class LogisticaModule {}
