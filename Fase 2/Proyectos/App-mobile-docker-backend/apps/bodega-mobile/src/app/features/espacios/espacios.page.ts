import { Component, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { VarianteStock } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { addCircleOutline, printOutline, scanOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { mensajeDeError } from '../../core/api/errores';
import { CodigoQrComponent } from '../../shared/codigo-qr.component';
import { valorDeEvento } from '../../shared/formato';
import { ImagenPrendaComponent } from '../../shared/imagen-prenda.component';
import { ImpresionService } from '../../shared/impresion.service';
import { BuscadorVarianteComponent } from '../escaner/buscador-variante.component';
import { EscanerService } from '../escaner/escaner.service';
import { InventarioApi } from '../inventario/inventario.api';
import { Espacio, agruparEspacios, contenidoDeEspacio, esCodigoDeEspacio, filtrarEspacios, resumenDeEspacio } from './espacios';

/**
 * Espacios de la bodega con su código QR. Cada etiqueta lleva el número del espacio
 * para pegarla en la repisa: al escanearla se ven los modelos que se guardan ahí, con
 * sus tallas, y se pueden agregar otros productos al espacio.
 */
@Component({
  selector: 'app-espacios',
  imports: [
    BuscadorVarianteComponent,
    CodigoQrComponent,
    ImagenPrendaComponent,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonContent,
    IonHeader,
    IonIcon,
    IonSearchbar,
    IonText,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/inicio"></ion-back-button>
        </ion-buttons>
        <ion-title>Ubicaciones</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (elegido(); as espacio) {
        <div class="detalle">
          <div #etiqueta class="rs-etiqueta">
            <app-codigo-qr [texto]="espacio.codigo" style="--tamano: 220px"></app-codigo-qr>
            <p class="rs-etiqueta-codigo">{{ espacio.codigo }}</p>
            <p class="rs-etiqueta-producto">{{ resumen(espacio) }}</p>
          </div>
        </div>
        <dl class="rs-datos datos">
          <div>
            <dt>Zona</dt>
            <dd>{{ espacio.zona }}</dd>
          </div>
          <div class="rs-destacado">
            <dt>Número</dt>
            <dd>{{ espacio.numero }}</dd>
          </div>
          <div>
            <dt>Modelos</dt>
            <dd>{{ contenido().length }}</dd>
          </div>
          <div>
            <dt>Unidades en bodega</dt>
            <dd>{{ espacio.unidadesEnBodega }}</dd>
          </div>
        </dl>

        <h3 class="titulo-seccion">Guardado en este espacio</h3>
        @for (modelo of contenido(); track modelo.producto + modelo.color) {
          <ion-card class="modelo">
            <div class="modelo-fila">
              <app-imagen-prenda [url]="modelo.imagenUrl" [alt]="modelo.producto" style="--tamano: 72px"></app-imagen-prenda>
              <div class="modelo-datos">
                <h4>{{ modelo.producto }}</h4>
                <p class="tenue">
                  @if (modelo.banda) {
                    {{ modelo.banda }} ·
                  }
                  {{ modelo.color }} · {{ modelo.unidadesEnBodega }} en bodega
                </p>
                <ul class="tallas" [attr.aria-label]="'Tallas de ' + modelo.producto">
                  @for (talla of modelo.tallas; track talla.variante.idVariante) {
                    <li [class.agotada]="talla.enBodega === 0" [attr.title]="talla.variante.sku">
                      <span>{{ talla.talla }}</span>
                      <strong>{{ talla.enBodega }}</strong>
                    </li>
                  }
                </ul>
              </div>
            </div>
          </ion-card>
        } @empty {
          <p class="rs-ayuda vacio">Este espacio aún no guarda productos.</p>
        }

        <div class="rs-acciones">
          @if (agregando()) {
            <p class="rs-ayuda">
              Escanea la etiqueta de una prenda o búscala. Su producto pasa a {{ espacio.codigo }} con todas sus tallas.
            </p>
          } @else {
            <ion-button expand="block" (click)="empezarAAgregar()">
              <ion-icon slot="start" name="add-circle-outline" aria-hidden="true"></ion-icon>
              Agregar producto a este espacio
            </ion-button>
          }
        </div>
        @if (agregando()) {
          <app-buscador-variante (seleccionada)="proponer($event)"></app-buscador-variante>
          @if (porMover(); as variante) {
            <ion-card class="confirmacion">
              <p>
                ¿Mover <strong>{{ variante.producto }}</strong>, con todas sus tallas, de {{ variante.codigoUbicacion }} a
                {{ espacio.codigo }}?
              </p>
              <div class="botones">
                <ion-button [disabled]="moviendo()" (click)="mover(variante)">{{ moviendo() ? 'Moviendo…' : 'Mover' }}</ion-button>
                <ion-button fill="outline" [disabled]="moviendo()" (click)="porMover.set(null)">Cancelar</ion-button>
              </div>
            </ion-card>
          }
          <div class="rs-acciones">
            <ion-button expand="block" fill="clear" (click)="terminarDeAgregar()">Listo</ion-button>
          </div>
        }
        @if (aviso(); as texto) {
          <ion-text color="success">
            <p role="status" class="aviso">{{ texto }}</p>
          </ion-text>
        }

        <div class="rs-acciones">
          @if (impresion.disponible) {
            <ion-button expand="block" fill="outline" (click)="imprimirElegido()">
              <ion-icon slot="start" name="print-outline" aria-hidden="true"></ion-icon>
              Imprimir etiqueta
            </ion-button>
          } @else {
            <p class="rs-ayuda">Para imprimir las etiquetas, abre esta pantalla desde el computador.</p>
          }
          <ion-button expand="block" fill="outline" (click)="volverALaLista()">Ver todos los espacios</ion-button>
        </div>
      } @else {
        <div class="rs-acciones">
          <ion-button expand="block" [disabled]="escaneando()" (click)="escanearEspacio()">
            <ion-icon slot="start" name="scan-outline" aria-hidden="true"></ion-icon>
            Escanear espacio
          </ion-button>
        </div>
        <ion-searchbar
          placeholder="Código, producto o categoría"
          [value]="filtro()"
          (ionInput)="filtro.set(valor($event))"
        ></ion-searchbar>
        @if (impresion.disponible && visibles().length > 0) {
          <div class="rs-acciones">
            <ion-button expand="block" fill="outline" (click)="imprimirVisibles()">
              <ion-icon slot="start" name="print-outline" aria-hidden="true"></ion-icon>
              Imprimir {{ visibles().length === 1 ? '1 etiqueta' : visibles().length + ' etiquetas' }}
            </ion-button>
          </div>
        }
        @for (espacio of visibles(); track espacio.codigo) {
          <ion-card button (click)="abrir(espacio.codigo)">
            <!-- La fila va en un contenedor propio: la tarjeta envuelve su contenido en un botón interno. -->
            <div class="espacio">
              <app-codigo-qr [texto]="espacio.codigo" style="--tamano: 84px"></app-codigo-qr>
              <div>
                <h2>{{ espacio.codigo }}</h2>
                <p>{{ espacio.productos.join(' · ') }}</p>
                <p class="tenue">
                  {{ espacio.categoria }}
                  @if (espacio.banda) {
                    · {{ espacio.banda }}
                  }
                  · {{ espacio.unidadesEnBodega }} en bodega
                </p>
              </div>
            </div>
          </ion-card>
        } @empty {
          @if (!mensaje()) {
            <p role="status">{{ cargando() ? 'Cargando espacios…' : 'No se encontraron espacios.' }}</p>
          }
        }
      }
      @if (mensaje(); as texto) {
        <ion-text color="danger">
          <p role="alert" class="aviso">{{ texto }}</p>
        </ion-text>
      }

      <!-- Hoja con todas las etiquetas visibles; solo existe para copiarla al imprimir. -->
      <div #hoja class="rs-etiquetas">
        @for (espacio of visibles(); track espacio.codigo) {
          <div class="rs-etiqueta">
            <app-codigo-qr [texto]="espacio.codigo"></app-codigo-qr>
            <p class="rs-etiqueta-codigo">{{ espacio.codigo }}</p>
            <p class="rs-etiqueta-producto">{{ resumen(espacio) }}</p>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .detalle {
      padding: 12px 16px 4px;
    }
    .datos {
      margin: 12px 16px;
    }
    .espacio {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px;
      text-align: start;
    }
    h2 {
      font-family: var(--rs-fuente-titulo);
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      line-height: 1.1;
    }
    .espacio p {
      margin: 4px 0 0;
      line-height: 1.3;
    }
    .tenue {
      color: var(--rs-tenue);
      font-size: 0.85rem;
    }
    .titulo-seccion {
      margin: 20px 16px 4px;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rs-tenue);
    }
    .modelo-fila {
      display: flex;
      gap: 14px;
      padding: 12px;
    }
    .modelo-datos {
      min-width: 0;
      flex: 1;
    }
    h4 {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      color: var(--ion-text-color);
    }
    .modelo-datos .tenue {
      margin: 2px 0 8px;
    }
    .tallas {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tallas li {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--ion-color-primary);
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--ion-text-color);
    }
    .tallas strong {
      color: var(--ion-color-primary);
    }
    .tallas li.agotada {
      border-color: var(--rs-tenue);
      color: var(--rs-tenue);
    }
    .tallas li.agotada strong {
      color: inherit;
    }
    .vacio {
      margin: 8px 16px;
    }
    .confirmacion {
      padding: 12px 16px;
    }
    .confirmacion p {
      margin: 0 0 8px;
      color: var(--ion-text-color);
    }
    .botones {
      display: flex;
      gap: 8px;
    }
    .aviso {
      margin: 8px 16px;
    }
  `,
})
export class EspaciosPage {
  private readonly api = inject(InventarioApi);
  private readonly escaner = inject(EscanerService);
  protected readonly impresion = inject(ImpresionService);

  /**
   * Código de espacio pedido en la dirección (`/espacios?codigo=B-POL-03`), por ejemplo al
   * escanear su etiqueta desde otra pantalla. Cada código nuevo abre su espacio.
   */
  readonly codigo = input<string>();

  private readonly variantes = signal<VarianteStock[]>([]);
  readonly filtro = signal('');
  readonly cargando = signal(false);
  readonly mensaje = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly escaneando = signal(false);

  readonly espacios = computed(() => agruparEspacios(this.variantes()));
  readonly visibles = computed(() => filtrarEspacios(this.espacios(), this.filtro()));

  readonly codigoElegido = signal<string | null>(null);
  /**
   * El espacio abierto. Uno escaneado que aún no guarda nada también se abre, vacío,
   * para poder agregarle productos.
   */
  readonly elegido = computed<Espacio | null>(() => {
    const codigo = this.codigoElegido()?.trim().toUpperCase();
    if (!codigo) {
      return null;
    }
    const existente = this.espacios().find((espacio) => espacio.codigo.toUpperCase() === codigo);
    if (existente || !esCodigoDeEspacio(codigo)) {
      return existente ?? null;
    }
    const [, zona = '', numero = codigo] = /^B-([^-]+)-(.+)$/.exec(codigo) ?? [];
    return { codigo, zona, numero, productos: [], categoria: '', banda: null, imagenUrl: null, variantes: 0, unidadesEnBodega: 0 };
  });
  readonly contenido = computed(() => {
    const espacio = this.elegido();
    return espacio ? contenidoDeEspacio(this.variantes(), espacio.codigo) : [];
  });

  /** Agregando productos al espacio abierto, y la prenda cuyo producto se propone mover. */
  readonly agregando = signal(false);
  readonly porMover = signal<VarianteStock | null>(null);
  readonly moviendo = signal(false);

  private readonly etiqueta = viewChild<ElementRef<HTMLElement>>('etiqueta');
  private readonly hoja = viewChild<ElementRef<HTMLElement>>('hoja');

  protected readonly valor = valorDeEvento;
  protected readonly resumen = resumenDeEspacio;

  constructor() {
    addIcons({ addCircleOutline, printOutline, scanOutline });
    effect(() => {
      const pedido = this.codigo();
      if (pedido) {
        untracked(() => this.abrir(pedido));
      }
    });
  }

  /** Ionic lo llama cada vez que se entra a la pantalla, de modo que los espacios estén al día. */
  ionViewWillEnter(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.mensaje.set(null);
    try {
      this.variantes.set(await firstValueFrom(this.api.buscarVariantes('')));
    } catch (error) {
      this.mensaje.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  abrir(codigo: string): void {
    this.codigoElegido.set(codigo.trim().toUpperCase());
    this.terminarDeAgregar();
    this.mensaje.set(null);
  }

  volverALaLista(): void {
    this.codigoElegido.set(null);
    this.terminarDeAgregar();
  }

  /** Lee la etiqueta de un espacio y lo abre con lo que guarda. */
  async escanearEspacio(): Promise<void> {
    this.mensaje.set(null);
    this.escaneando.set(true);
    try {
      const resultado = await this.escaner.escanear();
      if (resultado.estado === 'leido') {
        if (esCodigoDeEspacio(resultado.codigo)) {
          this.abrir(resultado.codigo);
        } else {
          this.mensaje.set(`${resultado.codigo} no es el código de un espacio: escanea la etiqueta de la repisa.`);
        }
      } else if (resultado.estado === 'no-disponible') {
        this.mensaje.set(resultado.motivo);
      }
    } finally {
      this.escaneando.set(false);
    }
  }

  empezarAAgregar(): void {
    this.agregando.set(true);
    this.aviso.set(null);
    this.mensaje.set(null);
  }

  terminarDeAgregar(): void {
    this.agregando.set(false);
    this.porMover.set(null);
    this.aviso.set(null);
  }

  /** Antes de mover un producto se pide confirmarlo: se mueve con todas sus tallas. */
  proponer(variante: VarianteStock): void {
    this.aviso.set(null);
    this.mensaje.set(null);
    if (variante.codigoUbicacion.toUpperCase() === this.elegido()?.codigo.toUpperCase()) {
      this.porMover.set(null);
      this.aviso.set(`${variante.producto} ya está en este espacio.`);
      return;
    }
    this.porMover.set(variante);
  }

  async mover(variante: VarianteStock): Promise<void> {
    const espacio = this.elegido();
    if (!espacio || this.moviendo()) {
      return;
    }
    this.moviendo.set(true);
    this.mensaje.set(null);
    try {
      await firstValueFrom(this.api.editarVariante(variante.idVariante, { espacio: espacio.codigo }));
      this.porMover.set(null);
      this.variantes.set(await firstValueFrom(this.api.buscarVariantes('')));
      this.aviso.set(`${variante.producto} quedó en ${espacio.codigo}.`);
    } catch (error) {
      this.mensaje.set(mensajeDeError(error));
    } finally {
      this.moviendo.set(false);
    }
  }

  imprimirElegido(): void {
    this.imprimir(this.etiqueta());
  }

  imprimirVisibles(): void {
    this.imprimir(this.hoja());
  }

  private imprimir(referencia: ElementRef<HTMLElement> | undefined): void {
    if (referencia) {
      this.impresion.imprimir(referencia.nativeElement);
    }
  }
}
