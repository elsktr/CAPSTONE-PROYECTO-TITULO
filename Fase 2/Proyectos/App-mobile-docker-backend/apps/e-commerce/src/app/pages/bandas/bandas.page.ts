import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, IonButton, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { musicalNotesOutline } from 'ionicons/icons';
import { usePlaceholder } from '../../data/models';
import { ProductsService } from '../../services/products.service';

/**
 * Las bandas con prendas publicadas, una tarjeta por banda. Llegando desde el menú de
 * una categoría (`?categoria=Poleras`) muestra las bandas de esa categoría; cada
 * tarjeta lleva a la tienda con las prendas de la banda.
 */
@Component({
  selector: 'app-bandas',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonButton, IonIcon],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded">
        <div class="page-title">
          <div class="section-title"><ion-icon name="musical-notes-outline"></ion-icon> {{ category() ?? 'Toda la tienda' }}</div>
          <h1>Bandas</h1>
          <p class="text-muted">
            {{ category() ? 'Elige una banda para ver sus ' + category()!.toLowerCase() + '.' : 'Elige una banda para ver sus prendas.' }}
          </p>
        </div>

        <div class="band-grid">
          <a class="band-card" *ngFor="let band of bands()" routerLink="/shop" [queryParams]="linkParams(band.name)">
            <div class="band-img">
              <img [src]="band.image" [alt]="" loading="lazy" (error)="usePlaceholder($event)" />
            </div>
            <div class="band-body">
              <h2>{{ band.name }}</h2>
              <p>
                {{ band.products }} {{ band.products === 1 ? 'producto' : 'productos' }}
                <span *ngIf="!category()"> · {{ band.categories.join(', ') }}</span>
              </p>
              <p class="credit" *ngIf="band.credit">{{ band.credit }}</p>
            </div>
          </a>
        </div>

        <div class="empty" *ngIf="products.error() as message" role="alert">
          <p>{{ message }}</p>
          <ion-button class="btn-rockstar" [disabled]="products.loading()" (click)="products.load()">Reintentar</ion-button>
        </div>
        <div class="empty" *ngIf="!products.error() && bands().length === 0">
          <p>{{ products.loaded() ? 'No hay bandas con prendas publicadas.' : 'Cargando las bandas…' }}</p>
          <ion-button *ngIf="products.loaded()" class="btn-rockstar" routerLink="/shop">Ver toda la tienda</ion-button>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .page-title { margin-bottom: 20px; }
    .page-title h1 { margin: 8px 0; font-size: 28px; font-weight: 900; text-transform: uppercase; }
    .page-title p { margin: 0; font-size: 14px; }
    .band-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    @media (min-width: 768px) { .band-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (min-width: 1100px) { .band-grid { grid-template-columns: repeat(4, 1fr); } }
    .band-card {
      display: flex; flex-direction: column;
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden;
      color: inherit; text-decoration: none; transition: border-color 0.2s;
    }
    .band-card:hover, .band-card:focus-visible { border-color: var(--accent); outline: none; }
    .band-img { aspect-ratio: 4 / 3; overflow: hidden; background: #18181b; }
    .band-img img {
      width: 100%; height: 100%; object-fit: cover;
      filter: grayscale(0.6) contrast(1.1) brightness(0.8); transition: all 0.4s;
    }
    .band-card:hover .band-img img { filter: grayscale(0) brightness(1); transform: scale(1.05); }
    .band-body { padding: 14px; }
    .band-body h2 { margin: 0 0 4px; font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
    .band-body p { margin: 0; font-size: 12px; color: var(--text-faint); }
    .band-body .credit { margin-top: 8px; font-size: 9px; line-height: 1.3; opacity: 0.75; }
    .empty { text-align: center; padding: 40px 20px; color: var(--text-faint); }
  `],
})
export class BandasPage {
  products = inject(ProductsService);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);

  /** Categoría desde cuyo menú se llegó; sin ella se muestran las bandas de toda la tienda. */
  category = computed(() => this.params()?.get('categoria') || null);
  bands = computed(() => this.products.bands(this.category()));

  usePlaceholder = usePlaceholder;

  constructor() {
    addIcons({ 'musical-notes-outline': musicalNotesOutline });
    void this.products.load();
  }

  linkParams(band: string): Record<string, string> {
    const category = this.category();
    return category ? { categoria: category, banda: band } : { banda: band };
  }
}
