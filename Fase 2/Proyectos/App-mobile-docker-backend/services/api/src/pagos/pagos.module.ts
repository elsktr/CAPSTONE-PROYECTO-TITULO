import { Module } from '@nestjs/common';

import { CONFIGURACION, type Configuracion } from '../config.js';
import { PASARELA, PasarelaSimulada, PasarelaWebpay } from './pasarela.js';

@Module({
  // Webpay Plus de Transbank si está configurado (WEBPAY_AMBIENTE); si no, el doble que no cobra.
  providers: [
    {
      provide: PASARELA,
      inject: [CONFIGURACION],
      useFactory: ({ webpay }: Configuracion) => (webpay.ambiente === 'simulada' ? new PasarelaSimulada() : new PasarelaWebpay(webpay)),
    },
  ],
  exports: [PASARELA],
})
export class PagosModule {}
