import { Module } from '@nestjs/common';

import { CONFIGURACION, type Configuracion } from '../config.js';
import { PASARELA, PasarelaSimulada, PasarelaWebpay } from './pasarela.js';
import { PointController } from './point.controller.js';
import { PointService } from './point.service.js';

@Module({
  // Máquinas Point del POS, con la cuenta de Mercado Pago (MERCADOPAGO_ACCESS_TOKEN).
  controllers: [PointController],
  // Webpay Plus de Transbank si está configurado (WEBPAY_AMBIENTE); si no, el doble que no cobra.
  providers: [
    PointService,
    {
      provide: PASARELA,
      inject: [CONFIGURACION],
      useFactory: ({ webpay }: Configuracion) => (webpay.ambiente === 'simulada' ? new PasarelaSimulada() : new PasarelaWebpay(webpay)),
    },
  ],
  exports: [PASARELA],
})
export class PagosModule {}
