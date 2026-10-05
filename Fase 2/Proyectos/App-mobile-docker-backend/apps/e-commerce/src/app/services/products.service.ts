import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { ArticuloCatalogo, BandaCatalogo } from '@rockstar/contracts';
import { firstValueFrom } from 'rxjs';

import { API_URL, errorMessage } from '../core/api';
import { Product, compareSizes, toProduct } from '../data/models';

export interface CartItem extends Product {
  qty: number;
}

/** Lo que ofrece el menú de una categoría en la barra de navegación. */
export interface CategoryMenu {
  name: string;
  /** Tallas en que hay prendas publicadas de la categoría. */
  sizes: string[];
  /** Bandas con prendas en la categoría; vacío en las categorías sin bandas. */
  bands: string[];
}

/** Banda con lo necesario para mostrarla como tarjeta. */
export interface BandCard {
  name: string;
  /** Foto de la banda; si aún no tiene, la de una de sus prendas. */
  image: string;
  /** Autor y licencia de la foto de la banda, para mostrarlos junto a ella. */
  credit: string | null;
  /** Cantidad de productos distintos de la banda. */
  products: number;
  categories: string[];
}

const byName = (a: string, b: string) => a.localeCompare(b, 'es');

/** Catálogo de la tienda: las prendas con precio que publica el backend, con su disponibilidad. */
@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly http = inject(HttpClient);

  private readonly productsSig = signal<Product[]>([]);
  readonly products = this.productsSig.asReadonly();
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Falso hasta que el catálogo se cargó al menos una vez. */
  readonly loaded = signal(false);
  /** Fotos de las bandas que guarda el backend, por nombre de banda. */
  private readonly bandPhotos = signal(new Map<string, { image: string; credit: string | null }>());

  /** Categorías que tienen al menos una prenda publicada, en orden alfabético. */
  readonly categories = computed(() => [...new Set(this.productsSig().map((p) => p.category))].sort(byName));

  /** El menú de la tienda sale del catálogo: cada categoría con sus tallas y sus bandas. */
  readonly menu = computed<CategoryMenu[]>(() =>
    this.categories().map((name) => {
      const items = this.productsSig().filter((p) => p.category === name);
      return {
        name,
        sizes: [...new Set(items.map((p) => p.size))].sort(compareSizes),
        bands: [...new Set(items.flatMap((p) => (p.band ? [p.band] : [])))].sort(byName),
      };
    }),
  );

  /** Bandas con prendas publicadas, en orden alfabético. `category` las limita a las de esa categoría. */
  bands(category: string | null): BandCard[] {
    const cards = new Map<string, { image: string; products: Set<number>; categories: Set<string> }>();
    for (const product of this.productsSig()) {
      if (!product.band || (category !== null && product.category !== category)) {
        continue;
      }
      const card = cards.get(product.band) ?? { image: product.image, products: new Set(), categories: new Set() };
      card.products.add(product.productId);
      card.categories.add(product.category);
      cards.set(product.band, card);
    }
    const photos = this.bandPhotos();
    return [...cards]
      .map(([name, card]) => ({
        name,
        image: photos.get(name)?.image ?? card.image,
        credit: photos.get(name)?.credit ?? null,
        products: card.products.size,
        categories: [...card.categories].sort(byName),
      }))
      .sort((a, b) => byName(a.name, b.name));
  }

  /** Trae las fotos de las bandas. Si falla, las bandas se muestran con la foto de una de sus prendas. */
  private async loadBandPhotos(): Promise<void> {
    try {
      const bandas = await firstValueFrom(this.http.get<BandaCatalogo[]>(`${API_URL}/inventario/catalogo/bandas`));
      this.bandPhotos.set(new Map(bandas.flatMap((b) => (b.imagenUrl ? [[b.nombre, { image: b.imagenUrl, credit: b.credito }] as const] : []))));
    } catch {
      // Sin fotos de bandas la tienda funciona igual.
    }
  }

  /** Trae el catálogo actual. La disponibilidad cambia con cada venta, así que se pide al entrar a cada pantalla. */
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [catalogo] = await Promise.all([
        firstValueFrom(this.http.get<ArticuloCatalogo[]>(`${API_URL}/inventario/catalogo`)),
        this.loadBandPhotos(),
      ]);
      this.productsSig.set(catalogo.map(toProduct));
      this.loaded.set(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
