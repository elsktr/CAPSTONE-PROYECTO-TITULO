import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonButton, IonIcon, IonGrid, IonRow, IonCol } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline } from 'ionicons/icons';
import { ProductsService } from '../../services/products.service';
import { CartService } from '../../services/cart.service';
import { ToastService } from '../../services/toast.service';
import { AuthService } from '../../services/auth.service';
import { Product, formatCLP, usePlaceholder } from '../../data/models';
import { cleanQuery, matchesQuery } from '../../data/search';

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonButton, IonIcon, IonGrid, IonRow, IonCol],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <!-- Hero: solo en la portada, sin filtros -->
      <div class="hero" *ngIf="!hasFilters()">
        <div class="hero-glow"></div>
        <div class="hero-content">
          <div class="section-title">Nueva colección · 2026</div>
          <h1 class="hero-title">Viste el <span class="text-accent">ruido.</span></h1>
          <p class="hero-subtitle">
            Poleras, chaquetas y polerones para quienes prefieren guitarras
            pesadas, amplificadores al máximo y cero compromisos.
          </p>
        </div>
      </div>

      <!-- Lo elegido en la barra de navegación -->
      <div class="selection" *ngIf="hasFilters()">
        <div class="selection-text">
          <div class="section-title">{{ category() ?? 'Toda la tienda' }}</div>
          <h1>{{ title() }}</h1>
          <!-- Lo buscado se muestra con interpolación: Angular lo escapa y se ve como texto, sea lo que sea. -->
          <p class="searching" *ngIf="query()">
            Buscando <q>{{ query() }}</q> · {{ filtered().length }} {{ filtered().length === 1 ? 'resultado' : 'resultados' }}
          </p>
        </div>
        <a class="clear" routerLink="/shop">Quitar filtros</a>
      </div>

      <!-- Products grid -->
      <ion-grid class="products-grid">
        <ion-row>
          <ion-col size="6" size-md="4" size-lg="3" *ngFor="let p of filtered()">
            <div class="product-card" [class.is-anime]="p.category === 'Anime'">
              <div class="product-img-wrap">
                <img [src]="p.image" [alt]="p.name" class="product-card-img" loading="lazy" (error)="usePlaceholder($event)" />
                <div class="badge" [class.badge-anime]="p.category === 'Anime'" [class.badge-rock]="p.category !== 'Anime'">
                  {{ p.category }}
                </div>
                <div class="badge badge-low-stock" *ngIf="p.stock <= 3">Últimas unidades</div>
              </div>
              <div class="product-body">
                <h3>{{ p.name }}</h3>
                <div class="detail">{{ p.band ? p.band + ' · ' : '' }}{{ p.color }}</div>
                <div class="row-between">
                  <span class="price">{{ formatCLP(p.price) }}</span>
                  <span class="size">Talla {{ p.size }}</span>
                </div>
                <div class="stock">{{ p.stock > 0 ? 'Stock disponible: ' + p.stock : 'Agotado' }}</div>
                <ion-button
                  *ngIf="!isAdmin()"
                  expand="block"
                  [disabled]="p.stock <= 0"
                  class="add-btn"
                  [class.anime]="p.category === 'Anime'"
                  (click)="addToCart(p)"
                >
                  <ion-icon slot="start" name="add-outline"></ion-icon>
                  Agregar
                </ion-button>
              </div>
            </div>
          </ion-col>
        </ion-row>
      </ion-grid>

      <div class="empty" *ngIf="products.error() as message">
        <p>{{ message }}</p>
        <ion-button class="btn-rockstar" [disabled]="products.loading()" (click)="products.load()">Reintentar</ion-button>
      </div>
      <div class="empty" *ngIf="!products.error() && filtered().length === 0">
        <p>{{ products.loaded() ? 'No se encontraron productos.' : 'Cargando la tienda…' }}</p>
      </div>
    </ion-content>
  `,
  styles: [`
    .hero {
      position: relative;
      overflow: hidden;
      border-radius: 24px;
      border: 1px solid var(--border);
      background: linear-gradient(135deg, #0c0c0c, #1a0a0d, #000);
      padding: 28px 24px;
      margin: 16px;
    }
    .hero-glow {
      position: absolute;
      right: -80px;
      top: -100px;
      width: 300px;
      height: 300px;
      background: rgba(185, 28, 28, 0.2);
      border-radius: 50%;
      filter: blur(60px);
    }
    .hero-content { position: relative; max-width: 600px; }
    .hero-title {
      margin: 0;
      font-size: 36px;
      font-weight: 900;
      text-transform: uppercase;
      line-height: 1;
    }
    @media (min-width: 640px) { .hero-title { font-size: 56px; } }
    .hero-subtitle {
      margin: 16px 0 0;
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-muted);
      max-width: 540px;
    }
    .filters {
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .selection {
      display: flex; justify-content: space-between; align-items: flex-end; gap: 12px;
      padding: 20px 16px 4px;
    }
    .selection-text { min-width: 0; }
    .selection h1 { margin: 0; font-size: 26px; font-weight: 900; text-transform: uppercase; line-height: 1.1; }
    .searching { margin: 6px 0 0; font-size: 13px; color: var(--text-muted); overflow-wrap: anywhere; }
    .searching q { color: var(--text); }
    .selection .section-title { margin-bottom: 4px; font-size: 11px; }
    .clear {
      flex: none; padding: 6px 12px; border: 1px solid var(--border); border-radius: 999px;
      color: var(--text-muted); font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap;
    }
    .clear:hover { border-color: var(--accent); color: #fff; }
    .products-grid { padding: 16px; }
    .product-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      transition: border-color 0.2s;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .product-card.is-anime {
      border-color: rgba(147, 51, 234, 0.5);
      background: linear-gradient(180deg, #0c0c0c, #1a0a1f, #000);
    }
    .product-card:hover { border-color: var(--accent); }
    .product-img-wrap {
      position: relative;
      aspect-ratio: 4/5;
      background: #18181b;
      overflow: hidden;
    }
    .badge {
      position: absolute;
      top: 10px;
      left: 10px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 4px 8px;
      border-radius: 999px;
    }
    .badge-low-stock {
      bottom: 10px;
      left: 10px;
      top: auto;
      background: var(--accent);
      color: #fff;
    }
    .product-body { padding: 12px; display: flex; flex-direction: column; flex: 1; }
    .product-body h3 {
      font-size: 13px;
      font-weight: 700;
      line-height: 1.3;
      min-height: 36px;
      margin: 0 0 8px;
    }
    .row-between { display: flex; justify-content: space-between; align-items: center; }
    .price { font-size: 16px; font-weight: 900; }
    .size { font-size: 10px; color: var(--text-faint); background: #18181b; padding: 2px 6px; border-radius: 4px; }
    .stock { font-size: 11px; color: var(--text-faint); margin: 4px 0 8px; }
    .detail { font-size: 11px; color: var(--text-faint); margin: -4px 0 8px; }
    .add-btn {
      --background: #18181b;
      --color: var(--text-muted);
      --border-radius: 12px;
      --border: 1px solid var(--border);
      --padding-top: 8px;
      --padding-bottom: 8px;
      font-size: 12px;
      font-weight: 700;
      text-transform: none;
      margin-top: auto;
    }
    .add-btn:hover, .add-btn.anime {
      --background: var(--accent);
      --color: #fff;
      --border-color: var(--accent);
    }
    .empty { text-align: center; padding: 40px; color: var(--text-faint); }
  `],
})
export class ShopPage {
  products = inject(ProductsService);
  cart = inject(CartService);
  toast = inject(ToastService);
  router = inject(Router);

  auth = inject(AuthService);

  isAdmin = this.auth.isAdmin;

  /** Lo elegido en la barra de navegación llega en la dirección: `?categoria=Poleras&banda=Misfits&talla=M`. */
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
  category = computed(() => this.params()?.get('categoria') || null);
  band = computed(() => this.params()?.get('banda') || null);
  size = computed(() => this.params()?.get('talla') || null);
  /**
   * Lo buscado en la barra (`?q=`). La dirección la puede escribir cualquiera, así que el
   * texto se limpia y se acorta aquí también, no solo en el campo.
   */
  query = computed(() => cleanQuery(this.params()?.get('q')));
  hasFilters = computed(() => this.category() !== null || this.band() !== null || this.size() !== null || this.query() !== '');

  /** Título de la selección: la banda si se eligió una, si no la categoría, con la talla al final. */
  title = computed(() => {
    const main = this.band() ?? this.category() ?? (this.query() ? 'Búsqueda' : 'Prendas');
    return this.size() ? `${main} · Talla ${this.size()}` : main;
  });

  filtered = computed(() => {
    const category = this.category();
    const band = this.band();
    const size = this.size();
    const query = this.query();
    return this.products.products().filter(
      (p) =>
        (category === null || p.category === category) &&
        (band === null || p.band === band) &&
        (size === null || p.size === size) &&
        matchesQuery(p, query),
    );
  });

  constructor() {
    addIcons({ 'add-outline': addOutline });
    // La disponibilidad cambia con cada venta: el catálogo se pide cada vez que se entra a la tienda.
    void this.products.load();
  }

  formatCLP = formatCLP;
  usePlaceholder = usePlaceholder;

  addToCart(p: Product) {
    const result = this.cart.add(p);
    if (result.ok) this.toast.show('Producto agregado al carrito.');
    else this.toast.show(result.reason || 'No se pudo agregar.');
  }
}
