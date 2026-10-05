import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import type { Busqueda, Categoria, VarianteStock } from '@rockstar/contracts';
import { firstValueFrom, forkJoin } from 'rxjs';

import { mensajeDeError } from '../../core/api/errores';
import { FichaVarianteComponent } from '../../shared/ficha-variante.component';
import { existenciaEn, valorDeEvento } from '../../shared/formato';
import { ImagenPrendaComponent } from '../../shared/imagen-prenda.component';
import { EscanerService } from '../escaner/escaner.service';
import { InventarioApi } from '../inventario/inventario.api';

/** Variantes de un mismo producto, con el total de unidades que suman. */
export interface GrupoDeProducto {
  producto: string;
  categoria: string;
  banda: string | null;
  imagenUrl: string | null;
  codigoUbicacion: string;
  variantes: VarianteStock[];
  unidades: number;
}

/** Filtro de banda: todas, una banda por su nombre, o solo las prendas sin banda. */
export type FiltroDeBanda = { tipo: 'TODAS' } | { tipo: 'BANDA'; nombre: string } | { tipo: 'SIN_BANDA' };

const TODAS_LAS_BANDAS: FiltroDeBanda = { tipo: 'TODAS' };

/** Valor de la opción "Sin banda" en la lista de bandas; no puede coincidir con el nombre de una banda. */
export const SIN_BANDA = '__sin_banda__';

function formatoDuracion(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  return `${minutos}:${String(segundos % 60).padStart(2, '0')}`;
}

function unidadesDe(variante: VarianteStock): number {
  return variante.existencias.reduce((suma, existencia) => suma + existencia.cantidad, 0);
}

/**
 * Ubicar una prenda midiendo el tiempo: se elige la variante entre las tarjetas de
 * stock por producto, se inicia la búsqueda y se confirma el hallazgo escaneando la prenda.
 */
@Component({
  selector: 'app-busqueda',
  imports: [
    FichaVarianteComponent,
    ImagenPrendaComponent,
    IonBackButton,
    IonBadge,
    IonButton,
    IonButtons,
    IonCard,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
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
        <ion-title>Buscar prenda</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (variante(); as seleccionada) {
        <app-ficha-variante [variante]="seleccionada"></app-ficha-variante>
      } @else {
        <ion-searchbar
          placeholder="Nombre, banda, SKU o espacio"
          [value]="filtro()"
          (ionInput)="filtro.set(valor($event))"
        ></ion-searchbar>
        <ion-list>
          <ion-item>
            <ion-select
              label="Categoría"
              interface="action-sheet"
              cancelText="Cancelar"
              [value]="valorCategoria()"
              (ionChange)="seleccionarCategoria(valor($event))"
            >
              <ion-select-option value="">Todas</ion-select-option>
              @for (opcion of categorias(); track opcion.nombre) {
                <ion-select-option [value]="opcion.nombre">{{ opcion.nombre }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
          @if (filtraPorBanda()) {
            <ion-item>
              <ion-select
                label="Banda"
                interface="action-sheet"
                cancelText="Cancelar"
                [value]="valorBanda()"
                (ionChange)="seleccionarBanda(valor($event))"
              >
                <ion-select-option value="">Todas</ion-select-option>
                @for (nombre of bandas(); track nombre) {
                  <ion-select-option [value]="nombre">{{ nombre }}</ion-select-option>
                }
                @if (hayPrendasSinBanda()) {
                  <ion-select-option [value]="sinBanda">Sin banda</ion-select-option>
                }
              </ion-select>
            </ion-item>
          }
          @if (categoriaElegida(); as elegida) {
            <ion-item>
              <ion-select
                label="Talla"
                interface="action-sheet"
                cancelText="Cancelar"
                [value]="talla() ?? ''"
                (ionChange)="seleccionarTalla(valor($event))"
              >
                <ion-select-option value="">Todas</ion-select-option>
                @for (opcion of elegida.tallas; track opcion) {
                  <ion-select-option [value]="opcion">{{ opcion }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            @if (coloresDeCategoria().length > 0) {
              <ion-item>
                <ion-select
                  label="Color"
                  interface="action-sheet"
                  cancelText="Cancelar"
                  [value]="color() ?? ''"
                  (ionChange)="seleccionarColor(valor($event))"
                >
                  <ion-select-option value="">Todos</ion-select-option>
                  @for (opcion of coloresDeCategoria(); track opcion) {
                    <ion-select-option [value]="opcion">{{ opcion }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
            }
          }
        </ion-list>
        @for (grupo of grupos(); track grupo.producto) {
          <ion-card class="producto">
            <div class="encabezado">
              <app-imagen-prenda [url]="grupo.imagenUrl" style="--tamano: 76px"></app-imagen-prenda>
              <div>
                <h2>{{ grupo.producto }}</h2>
                <p class="origen">
                  {{ grupo.categoria }}
                  @if (grupo.banda) {
                    · {{ grupo.banda }}
                  }
                </p>
                <div class="rs-chips">
                  <span class="rs-chip rs-chip--acento">{{ grupo.unidades }} unidades en stock</span>
                  <span class="rs-codigo">{{ grupo.codigoUbicacion }}</span>
                </div>
              </div>
            </div>
            <ion-list>
              @for (opcion of grupo.variantes; track opcion.idVariante) {
                <ion-item [button]="opcion.activo" [disabled]="!opcion.activo" (click)="seleccionar(opcion)">
                  <ion-label>
                    <h3>Talla {{ opcion.talla }} · {{ opcion.color }}</h3>
                    <p>{{ opcion.sku }}</p>
                    <p>Bodega {{ enUbicacion(opcion, 'BODEGA') }} · Sala de ventas {{ enUbicacion(opcion, 'SALA_VENTAS') }}</p>
                  </ion-label>
                  @if (opcion.activo) {
                    <ion-note slot="end" class="disponible"><strong>{{ opcion.disponible }}</strong> disp.</ion-note>
                  } @else {
                    <ion-badge slot="end" color="medium">Desactivado</ion-badge>
                  }
                </ion-item>
              }
            </ion-list>
          </ion-card>
        } @empty {
          <p role="status">
            {{ cargando() ? 'Cargando productos…' : 'No se encontraron productos.' }}
          </p>
        }
      }

      <div class="rs-acciones">
        @if (variante() && !busqueda()) {
          <ion-button expand="block" [disabled]="ocupado()" (click)="iniciar()">Iniciar búsqueda</ion-button>
          <ion-button expand="block" fill="clear" [disabled]="ocupado()" (click)="reiniciar()">
            Elegir otra prenda
          </ion-button>
        }
        @if (busqueda(); as actual) {
          @if (actual.duracionSegundos === undefined) {
            <div class="reloj">
              <span>Tiempo de búsqueda</span>
              <p class="cronometro" role="timer">{{ cronometro() }}</p>
            </div>
            <ion-button expand="block" [disabled]="ocupado()" (click)="escanearEncontrada()">
              Escanear prenda encontrada
            </ion-button>
            @if (escanerNoDisponible()) {
              <ion-item class="manual">
                <ion-input
                  label="Código o SKU de la prenda"
                  labelPlacement="stacked"
                  [value]="codigoManual()"
                  (ionInput)="codigoManual.set(valor($event))"
                ></ion-input>
              </ion-item>
              <ion-button expand="block" fill="outline" [disabled]="ocupado()" (click)="confirmarCodigo(codigoManual())">
                Confirmar código
              </ion-button>
            }
            <ion-button expand="block" fill="clear" color="medium" [disabled]="ocupado()" (click)="cancelar()">
              Cancelar búsqueda
            </ion-button>
          } @else {
            <p class="rs-exito" role="status">Prenda encontrada en {{ duracion(actual.duracionSegundos) }} minutos.</p>
            <ion-button expand="block" (click)="reiniciar()">Nueva búsqueda</ion-button>
          }
        }
        @if (mensaje(); as texto) {
          <ion-text color="danger">
            <p role="alert">{{ texto }}</p>
          </ion-text>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .reloj {
      padding: 20px 0 10px;
      color: var(--rs-tenue);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-align: center;
      text-transform: uppercase;
    }
    .cronometro {
      margin: 0;
      color: var(--ion-color-primary);
      font-family: var(--rs-fuente-titulo);
      font-size: 5rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
      line-height: 1.1;
    }
    .encabezado {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 16px 12px;
    }
    h2 {
      font-family: var(--rs-fuente-titulo);
      font-size: 1.4rem;
      font-weight: 600;
      line-height: 1.15;
    }
    .origen {
      margin: 2px 0 8px;
      color: var(--rs-tenue);
      font-size: 0.85rem;
    }
    .producto ion-list {
      border-top: 1px solid var(--rs-borde);
    }
    .disponible strong {
      color: var(--ion-color-primary);
      font-size: 1.05rem;
    }
    .manual {
      margin-top: 8px;
      border: 1px solid var(--rs-borde);
      border-radius: var(--rs-radio-chico);
      --inner-border-width: 0;
    }
  `,
})
export class BusquedaPage implements OnDestroy {
  private readonly api = inject(InventarioApi);
  private readonly escaner = inject(EscanerService);

  readonly variante = signal<VarianteStock | null>(null);
  readonly busqueda = signal<Busqueda | null>(null);
  readonly mensaje = signal<string | null>(null);
  readonly ocupado = signal(false);
  readonly escanerNoDisponible = signal(false);
  readonly codigoManual = signal('');

  private readonly transcurrido = signal(0);
  private temporizador: ReturnType<typeof setInterval> | null = null;

  private readonly catalogo = signal<VarianteStock[]>([]);
  readonly filtro = signal('');
  readonly cargando = signal(false);

  readonly banda = signal<FiltroDeBanda>(TODAS_LAS_BANDAS);

  /** Bandas registradas, tengan o no prendas, en orden alfabético. */
  readonly bandas = signal<string[]>([]);
  readonly hayPrendasSinBanda = computed(() => this.catalogo().some((variante) => variante.banda === null));

  /** Categoría elegida, o `null` para mostrar todas. */
  readonly categoria = signal<string | null>(null);

  /** Categorías registradas, tengan o no prendas, en orden alfabético. */
  readonly categorias = signal<Categoria[]>([]);

  /** Datos de la categoría elegida: de ella dependen los filtros que se ofrecen. */
  readonly categoriaElegida = computed(() => this.categorias().find((c) => c.nombre === this.categoria()) ?? null);

  /** El filtro de banda se ofrece sin categoría elegida o cuando la categoría tiene bandas. */
  readonly filtraPorBanda = computed(() => this.categoriaElegida()?.usaBanda ?? true);

  /** Talla y color elegidos dentro de la categoría, o `null` para mostrar todos. */
  readonly talla = signal<string | null>(null);
  readonly color = signal<string | null>(null);

  /** Colores que tienen las prendas de la categoría elegida, en orden alfabético. */
  readonly coloresDeCategoria = computed(() => {
    const categoria = this.categoria();
    const colores = this.catalogo().flatMap((variante) => (variante.categoria === categoria ? [variante.color] : []));
    return [...new Set(colores)].sort((a, b) => a.localeCompare(b, 'es'));
  });

  /**
   * Stock agrupado en una tarjeta por producto, limitado a lo que coincide con el texto,
   * la categoría, la banda, la talla y el color.
   */
  readonly grupos = computed<GrupoDeProducto[]>(() => {
    const texto = this.filtro().trim().toLowerCase();
    const categoria = this.categoria();
    const banda = this.banda();
    const talla = this.talla();
    const color = this.color();
    const grupos = new Map<string, GrupoDeProducto>();
    for (const variante of this.catalogo()) {
      const coincideTexto =
        !texto ||
        [variante.producto, variante.sku, variante.categoria, variante.banda ?? '', variante.codigoUbicacion].some((campo) =>
          campo.toLowerCase().includes(texto),
        );
      const coincideCategoria = categoria === null || variante.categoria === categoria;
      const coincideBanda =
        banda.tipo === 'TODAS' ||
        (banda.tipo === 'SIN_BANDA' ? variante.banda === null : variante.banda === banda.nombre);
      const coincideTalla = talla === null || variante.talla === talla;
      const coincideColor = color === null || variante.color === color;
      if (!coincideTexto || !coincideCategoria || !coincideBanda || !coincideTalla || !coincideColor) {
        continue;
      }
      const grupo = grupos.get(variante.producto) ?? {
        producto: variante.producto,
        categoria: variante.categoria,
        banda: variante.banda,
        imagenUrl: variante.imagenUrl,
        codigoUbicacion: variante.codigoUbicacion,
        variantes: [],
        unidades: 0,
      };
      grupo.variantes.push(variante);
      grupo.unidades += unidadesDe(variante);
      grupos.set(variante.producto, grupo);
    }
    return [...grupos.values()];
  });

  readonly cronometro = computed(() => formatoDuracion(this.transcurrido()));
  protected readonly duracion = formatoDuracion;
  protected readonly valor = valorDeEvento;
  protected readonly enUbicacion = existenciaEn;

  protected readonly sinBanda = SIN_BANDA;

  /** Valor de la lista de categorías: vacío equivale a "Todas". */
  readonly valorCategoria = computed(() => this.categoria() ?? '');

  /** Valor de la lista de bandas: vacío equivale a "Todas". */
  readonly valorBanda = computed(() => {
    const banda = this.banda();
    return banda.tipo === 'BANDA' ? banda.nombre : banda.tipo === 'SIN_BANDA' ? SIN_BANDA : '';
  });

  /**
   * Aplica la categoría elegida en la lista; vacío vuelve a mostrar todas. Los filtros de
   * talla y color son propios de cada categoría, así que se reinician al cambiarla.
   */
  seleccionarCategoria(nombre: string): void {
    this.categoria.set(nombre === '' ? null : nombre);
    this.talla.set(null);
    this.color.set(null);
    if (!this.filtraPorBanda()) {
      this.banda.set(TODAS_LAS_BANDAS);
    }
  }

  seleccionarTalla(talla: string): void {
    this.talla.set(talla === '' ? null : talla);
  }

  seleccionarColor(color: string): void {
    this.color.set(color === '' ? null : color);
  }

  /** Aplica la banda elegida en la lista: vacío es todas y `SIN_BANDA` las prendas sin banda. */
  seleccionarBanda(valor: string): void {
    if (valor === '') {
      this.banda.set(TODAS_LAS_BANDAS);
    } else if (valor === SIN_BANDA) {
      this.banda.set({ tipo: 'SIN_BANDA' });
    } else {
      this.banda.set({ tipo: 'BANDA', nombre: valor });
    }
  }

  /** Ionic lo llama cada vez que se entra a la pantalla, de modo que el stock mostrado esté al día. */
  ionViewWillEnter(): void {
    void this.cargar();
  }

  /** Trae el stock de todas las variantes para mostrarlo en las tarjetas. */
  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const [variantes, categorias, bandas] = await firstValueFrom(
        forkJoin([this.api.buscarVariantes(''), this.api.categorias(), this.api.bandas()]),
      );
      this.catalogo.set(variantes);
      this.categorias.set(categorias);
      this.bandas.set(bandas);
    } catch (error) {
      this.mensaje.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy(): void {
    // Salir de la pantalla con una búsqueda en curso equivale a abandonarla.
    if (this.enCurso()) {
      void this.cancelar();
    }
    this.detenerCronometro();
  }

  seleccionar(variante: VarianteStock): void {
    if (!variante.activo) {
      return;
    }
    this.variante.set(variante);
    this.mensaje.set(null);
  }

  async iniciar(): Promise<void> {
    const variante = this.variante();
    if (!variante || this.ocupado()) {
      return;
    }
    await this.conApi(async () => {
      this.busqueda.set(await firstValueFrom(this.api.iniciarBusqueda({ idVariante: variante.idVariante })));
      this.iniciarCronometro();
    });
  }

  async escanearEncontrada(): Promise<void> {
    const resultado = await this.escaner.escanear();
    if (resultado.estado === 'leido') {
      await this.confirmarCodigo(resultado.codigo);
    } else if (resultado.estado === 'no-disponible') {
      this.escanerNoDisponible.set(true);
      this.mensaje.set('El escáner no está disponible. Ingresa el código o SKU de la prenda encontrada.');
    }
  }

  async confirmarCodigo(codigo: string): Promise<void> {
    const variante = this.variante();
    const busqueda = this.busqueda();
    if (!variante || !busqueda || !this.enCurso()) {
      return;
    }
    const leido = codigo.trim();
    if (leido !== variante.codigo && leido !== variante.sku) {
      this.mensaje.set('La prenda escaneada no corresponde al producto buscado.');
      return;
    }
    await this.conApi(async () => {
      this.busqueda.set(
        await firstValueFrom(this.api.cerrarBusqueda(busqueda.idBusqueda, { resultado: 'ENCONTRADA' })),
      );
      this.detenerCronometro();
    });
  }

  async cancelar(): Promise<void> {
    const busqueda = this.busqueda();
    this.detenerCronometro();
    this.reiniciar();
    if (busqueda && busqueda.duracionSegundos === undefined) {
      try {
        await firstValueFrom(this.api.cerrarBusqueda(busqueda.idBusqueda, { resultado: 'CANCELADA' }));
      } catch {
        // Una búsqueda sin cierre tampoco registra duración, que es lo que se requiere.
      }
    }
  }

  reiniciar(): void {
    this.busqueda.set(null);
    this.variante.set(null);
    this.mensaje.set(null);
    this.escanerNoDisponible.set(false);
    this.codigoManual.set('');
    this.transcurrido.set(0);
  }

  private enCurso(): boolean {
    const busqueda = this.busqueda();
    return busqueda !== null && busqueda.duracionSegundos === undefined;
  }

  private async conApi(accion: () => Promise<void>): Promise<void> {
    this.ocupado.set(true);
    this.mensaje.set(null);
    try {
      await accion();
    } catch (error) {
      this.mensaje.set(mensajeDeError(error));
    } finally {
      this.ocupado.set(false);
    }
  }

  private iniciarCronometro(): void {
    const inicio = Date.now();
    this.transcurrido.set(0);
    this.temporizador = setInterval(() => this.transcurrido.set(Math.floor((Date.now() - inicio) / 1000)), 1000);
  }

  private detenerCronometro(): void {
    if (this.temporizador !== null) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
  }
}
