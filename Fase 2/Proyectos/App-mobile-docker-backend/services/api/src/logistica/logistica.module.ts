import { Module } from '@nestjs/common';

import { CONFIGURACION, type Configuracion } from '../config.js';
import { InventarioModule } from '../inventario/inventario.module.js';
import { DespachosService } from './despachos.service.js';
import { DestinosController } from './destinos.controller.js';
import { FletesService } from './fletes.service.js';
import { PedidosController } from './pedidos.controller.js';
import { StarkenDesactivado, StarkenSimulado, TRANSPORTISTA } from './transportista.js';

@Module({
  imports: [InventarioModule],
  controllers: [DestinosController, PedidosController],
  // Mientras no haya cuenta comercial con Starken, los fletes y los despachos los resuelve su
  // doble, o quedan apagados (STARKEN_AMBIENTE=desactivado).
  providers: [
    DespachosService,
    FletesService,
    {
      provide: TRANSPORTISTA,
      inject: [CONFIGURACION],
      useFactory: ({ starken }: Configuracion) => (starken === 'desactivado' ? new StarkenDesactivado() : new StarkenSimulado()),
    },
  ],
  // El checkout cobra el flete que cotiza Logística.
  exports: [FletesService],
})
export class LogisticaModule {}
