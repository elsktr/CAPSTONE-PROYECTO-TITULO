import { Component, computed, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { Ubicacion, VarianteStock } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { arrowForward } from 'ionicons/icons';

import { EnvioIdempotente } from '../../core/api/envio-idempotente';
import { AvisosService } from '../../shared/avisos.service';
import { EstadoEnvioComponent } from '../../shared/estado-envio.component';
import { FichaVarianteComponent } from '../../shared/ficha-variante.component';
import {
  UBICACIONES,
  enteroDesdeTexto,
  etiquetaUbicacion,
  existenciaEn,
  otraUbicacion,
  valorDeEvento,
} from '../../shared/formato';
import { BuscadorVarianteComponent } from '../escaner/buscador-variante.component';
import { InventarioApi } from '../inventario/inventario.api';

@Component({
  selector: 'app-traspaso',
  imports: [
    BuscadorVarianteComponent,
    EstadoEnvioComponent,
    FichaVarianteComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonList,
    IonSegment,
    IonSegmentButton,
    IonText,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/inicio"></ion-back-button>
        </ion-buttons>
        <ion-title>Traspaso</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (!bloqueado()) {
        <app-buscador-variante (seleccionada)="seleccionar($event)"></app-buscador-variante>
      }
      @if (variante(); as seleccionada) {
        <app-ficha-variante [variante]="seleccionada"></app-ficha-variante>

        <h2 class="rs-seccion">Desde</h2>
        <ion-segment [value]="origen()" [disabled]="bloqueado()" (ionChange)="origen.set($any(valor($event)))">
          @for (opcion of ubicaciones; track opcion.valor) {
            <ion-segment-button [value]="opcion.valor">{{ opcion.etiqueta }}</ion-segment-button>
          }
        </ion-segment>
        <p class="hacia">
          <ion-icon name="arrow-forward" aria-hidden="true"></ion-icon>
          Hacia <strong>{{ etiquetaUbicacion(destino()) }}</strong>
        </p>
        <ion-list>
          <ion-item>
            <ion-input
              label="Cantidad"
              labelPlacement="stacked"
              type="number"
              inputmode="numeric"
              [value]="cantidad()"
              [disabled]="bloqueado()"
              (ionInput)="cantidad.set(valor($event))"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-textarea
              label="Motivo"
              labelPlacement="stacked"
              [autoGrow]="true"
              [value]="motivo()"
              [disabled]="bloqueado()"
              (ionInput)="motivo.set(valor($event))"
            ></ion-textarea>
          </ion-item>
        </ion-list>

        @if (mostrarErrores() && errores().length > 0) {
          <ion-text color="danger">
            <ul role="alert">
              @for (error of errores(); track error) {
                <li>{{ error }}</li>
              }
            </ul>
          </ion-text>
        }
        <app-estado-envio [envio]="envio" (reintentar)="confirmar()"></app-estado-envio>

        @if (!envio.reintentable()) {
          <div class="rs-acciones">
            <ion-button expand="block" [disabled]="envio.enviando()" (click)="confirmar()">
              {{ envio.enviando() ? 'Registrando…' : 'Registrar traspaso' }}
            </ion-button>
          </div>
        }
      }
    </ion-content>
  `,
  styles: `
    .hacia {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 20px 0;
      color: var(--rs-tenue);
    }
    .hacia ion-icon {
      color: var(--ion-color-primary);
      font-size: 20px;
    }
    .hacia strong {
      color: var(--rs-texto);
    }
  `,
})
export class TraspasoPage {
  private readonly api = inject(InventarioApi);
  private readonly avisos = inject(AvisosService);

  readonly envio = new EnvioIdempotente();
  readonly variante = signal<VarianteStock | null>(null);
  readonly origen = signal<Ubicacion>('BODEGA');
  readonly destino = computed(() => otraUbicacion(this.origen()));
  readonly cantidad = signal('');
  readonly motivo = signal('');
  readonly mostrarErrores = signal(false);

  readonly bloqueado = computed(() => this.envio.enviando() || this.envio.reintentable());

  constructor() {
    addIcons({ arrowForward });
  }

  readonly errores = computed(() => {
    const variante = this.variante();
    const cantidad = enteroDesdeTexto(this.cantidad());
    const errores: string[] = [];
    if (variante && !variante.activo) {
      errores.push('El producto está desactivado y no admite traspasos.');
    }
    if (cantidad === null || cantidad === 0) {
      errores.push('La cantidad debe ser un entero mayor que cero.');
    } else if (variante && cantidad > existenciaEn(variante, this.origen())) {
      errores.push(`No hay existencia suficiente en ${etiquetaUbicacion(this.origen())}.`);
    }
    if (this.motivo().trim() === '') {
      errores.push('El motivo es obligatorio.');
    }
    return errores;
  });

  protected readonly ubicaciones = UBICACIONES;
  protected readonly etiquetaUbicacion = etiquetaUbicacion;
  protected readonly valor = valorDeEvento;

  seleccionar(variante: VarianteStock): void {
    this.variante.set(variante);
    this.mostrarErrores.set(false);
    this.envio.error.set(null);
  }

  async confirmar(): Promise<void> {
    const variante = this.variante();
    this.mostrarErrores.set(true);
    if (!variante || this.errores().length > 0) {
      return;
    }
    const cantidad = enteroDesdeTexto(this.cantidad()) ?? 0;
    const origen = this.origen();
    const destino = this.destino();
    const resultado = await this.envio.ejecutar((claveIdempotencia) =>
      this.api.registrarTraspaso({
        claveIdempotencia,
        idVariante: variante.idVariante,
        origen,
        destino,
        cantidad,
        motivo: this.motivo().trim(),
      }),
    );
    if (resultado) {
      this.variante.set(resultado.variantes[0] ?? null);
      this.cantidad.set('');
      this.motivo.set('');
      this.mostrarErrores.set(false);
      await this.avisos.exito(`Traspaso registrado: ${cantidad} unidades a ${etiquetaUbicacion(destino)}.`);
    }
  }
}
