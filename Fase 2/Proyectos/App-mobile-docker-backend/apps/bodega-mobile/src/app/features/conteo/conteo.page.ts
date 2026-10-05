import { Component, computed, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
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

import { EnvioIdempotente } from '../../core/api/envio-idempotente';
import { AvisosService } from '../../shared/avisos.service';
import { EstadoEnvioComponent } from '../../shared/estado-envio.component';
import { FichaVarianteComponent } from '../../shared/ficha-variante.component';
import { UBICACIONES, enteroDesdeTexto, etiquetaUbicacion, valorDeEvento } from '../../shared/formato';
import { BuscadorVarianteComponent } from '../escaner/buscador-variante.component';
import { InventarioApi } from '../inventario/inventario.api';

@Component({
  selector: 'app-conteo',
  imports: [
    BuscadorVarianteComponent,
    EstadoEnvioComponent,
    FichaVarianteComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
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
        <ion-title>Conteo</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (!bloqueado()) {
        <app-buscador-variante (seleccionada)="seleccionar($event)"></app-buscador-variante>
      }
      @if (variante(); as seleccionada) {
        <app-ficha-variante [variante]="seleccionada"></app-ficha-variante>

        <h2 class="rs-seccion">Conteo en</h2>
        <ion-segment [value]="ubicacion()" [disabled]="bloqueado()" (ionChange)="ubicacion.set($any(valor($event)))">
          @for (opcion of ubicaciones; track opcion.valor) {
            <ion-segment-button [value]="opcion.valor">{{ opcion.etiqueta }}</ion-segment-button>
          }
        </ion-segment>
        <ion-list>
          <ion-item>
            <ion-input
              label="Cantidad contada"
              labelPlacement="stacked"
              type="number"
              inputmode="numeric"
              [value]="cantidadContada()"
              [disabled]="bloqueado()"
              (ionInput)="cantidadContada.set(valor($event))"
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
        @if (ultimoAjuste(); as ajuste) {
          <p class="rs-exito" role="status">{{ ajuste }}</p>
        }
        <app-estado-envio [envio]="envio" (reintentar)="confirmar()"></app-estado-envio>

        @if (!envio.reintentable()) {
          <div class="rs-acciones">
            <ion-button expand="block" [disabled]="envio.enviando()" (click)="confirmar()">
              {{ envio.enviando() ? 'Registrando…' : 'Registrar conteo' }}
            </ion-button>
          </div>
        }
      }
    </ion-content>
  `,
})
export class ConteoPage {
  private readonly api = inject(InventarioApi);
  private readonly avisos = inject(AvisosService);

  readonly envio = new EnvioIdempotente();
  readonly variante = signal<VarianteStock | null>(null);
  readonly ubicacion = signal<Ubicacion>('BODEGA');
  readonly cantidadContada = signal('');
  readonly motivo = signal('');
  readonly mostrarErrores = signal(false);
  readonly ultimoAjuste = signal<string | null>(null);

  readonly bloqueado = computed(() => this.envio.enviando() || this.envio.reintentable());

  readonly errores = computed(() => {
    const errores: string[] = [];
    if (this.variante()?.activo === false) {
      errores.push('El producto está desactivado y no admite ajustes.');
    }
    if (enteroDesdeTexto(this.cantidadContada()) === null) {
      errores.push('La cantidad contada debe ser un entero mayor o igual a cero.');
    }
    if (this.motivo().trim() === '') {
      errores.push('El motivo es obligatorio.');
    }
    return errores;
  });

  protected readonly ubicaciones = UBICACIONES;
  protected readonly valor = valorDeEvento;

  seleccionar(variante: VarianteStock): void {
    this.variante.set(variante);
    this.mostrarErrores.set(false);
    this.ultimoAjuste.set(null);
    this.envio.error.set(null);
  }

  async confirmar(): Promise<void> {
    const variante = this.variante();
    const cantidadContada = enteroDesdeTexto(this.cantidadContada());
    this.mostrarErrores.set(true);
    if (!variante || cantidadContada === null || this.errores().length > 0) {
      return;
    }
    const ubicacion = this.ubicacion();
    const resultado = await this.envio.ejecutar((claveIdempotencia) =>
      this.api.registrarAjuste({
        claveIdempotencia,
        idVariante: variante.idVariante,
        ubicacion,
        cantidadContada,
        motivo: this.motivo().trim(),
      }),
    );
    if (resultado) {
      const diferencia = resultado.movimientos[0]?.cantidad ?? 0;
      this.variante.set(resultado.variantes[0] ?? null);
      this.cantidadContada.set('');
      this.motivo.set('');
      this.mostrarErrores.set(false);
      this.ultimoAjuste.set(
        diferencia === 0
          ? `El conteo coincide con el sistema en ${etiquetaUbicacion(ubicacion)}.`
          : `Ajuste de ${diferencia > 0 ? '+' : ''}${diferencia} en ${etiquetaUbicacion(ubicacion)}.`,
      );
      await this.avisos.exito('Conteo registrado.');
    }
  }
}
