import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  callOutline,
  cardOutline,
  cubeOutline,
  locationOutline,
  logoFacebook,
  logoInstagram,
  logoTiktok,
  logoWhatsapp,
  mailOutline,
  timeOutline,
} from 'ionicons/icons';

import { CONTACTO } from '../data/contacto';

/** Pie de página de la tienda: contactos, local, redes y las categorías. */
@Component({
  selector: 'app-site-footer',
  standalone: true,
  imports: [CommonModule, RouterLink, IonIcon],
  template: `
    <footer class="footer">
      <div class="cols">
        <section class="brand">
          <div class="brand-row">
            <span class="brand-logo" aria-hidden="true">♠</span>
            <div>
              <div class="brand-name">Rockstar e-commerce</div>
              <div class="brand-tag">Rock · Metal · Underground</div>
            </div>
          </div>
          <p>Ropa de bandas y prendas con actitud, en la tienda física y en línea, sobre un mismo inventario.</p>
          <div class="perks">
            <span><ion-icon name="card-outline"></ion-icon>Pago seguro con Webpay</span>
            <span><ion-icon name="cube-outline"></ion-icon>Envíos a todo Chile</span>
          </div>
        </section>

        <section>
          <h2>Contacto</h2>
          <ul>
            <li>
              <a [href]="'https://wa.me/' + c.telefono" target="_blank" rel="noopener">
                <ion-icon name="logo-whatsapp"></ion-icon>WhatsApp {{ c.telefonoVisible }}
              </a>
            </li>
            <li>
              <a [href]="'tel:+' + c.telefono"><ion-icon name="call-outline"></ion-icon>{{ c.telefonoVisible }}</a>
            </li>
            <li>
              <a [href]="'mailto:' + c.correoVentas"><ion-icon name="mail-outline"></ion-icon>{{ c.correoVentas }}</a>
              <span class="hint">Ventas y pedidos</span>
            </li>
            <li>
              <a [href]="'mailto:' + c.correoAyuda"><ion-icon name="mail-outline"></ion-icon>{{ c.correoAyuda }}</a>
              <span class="hint">Cambios, devoluciones y ayuda</span>
            </li>
          </ul>
        </section>

        <section>
          <h2>Tienda física</h2>
          <ul>
            <li class="plain"><ion-icon name="location-outline"></ion-icon><span>{{ c.direccion }}<br />{{ c.comuna }}</span></li>
            <li class="plain">
              <ion-icon name="time-outline"></ion-icon>
              <span><ng-container *ngFor="let h of c.horario; let last = last">{{ h }}<br *ngIf="!last" /></ng-container></span>
            </li>
          </ul>
        </section>

        <section>
          <h2>Síguenos</h2>
          <ul>
            <li *ngFor="let r of c.redes">
              <a [href]="r.url" target="_blank" rel="noopener" [attr.aria-label]="r.nombre + ' ' + r.usuario">
                <ion-icon [name]="icono(r.nombre)"></ion-icon>{{ r.usuario }}
              </a>
            </li>
          </ul>
          <ng-container *ngIf="categories().length > 0">
            <h2 class="spaced">Categorías</h2>
            <div class="cats">
              <a *ngFor="let cat of categories()" routerLink="/shop" [queryParams]="{ categoria: cat }">{{ cat }}</a>
            </div>
          </ng-container>
        </section>
      </div>
      <div class="legal">© {{ year }} Rockstar e-commerce · Los nombres de las bandas son marcas de sus dueños.</div>
    </footer>
  `,
  styles: [`
    .footer {
      margin: 32px 16px 16px; padding: 28px 24px 18px;
      border: 1px solid var(--border); border-radius: 24px;
      background: linear-gradient(160deg, #0c0c0c, #140708 60%, #000);
    }
    .cols { display: grid; gap: 28px; grid-template-columns: 1fr; }
    @media (min-width: 640px) { .cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (min-width: 1024px) { .cols { grid-template-columns: 1.4fr 1fr 1fr 1fr; } }
    h2 { margin: 0 0 12px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; color: var(--accent); }
    h2.spaced { margin-top: 20px; }
    .brand-row { display: flex; align-items: center; gap: 12px; }
    .brand-name { font-size: 16px; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; }
    .brand-tag { font-size: 9px; letter-spacing: 0.28em; color: var(--text-faint); text-transform: uppercase; }
    .brand p { margin: 14px 0 0; font-size: 13px; line-height: 1.6; color: var(--text-muted); max-width: 360px; }
    .perks { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    .perks span {
      display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px;
      border: 1px solid var(--border); border-radius: 999px; font-size: 11px; color: var(--text-muted);
    }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    li { font-size: 13px; }
    li a, li.plain { display: inline-flex; align-items: flex-start; gap: 8px; color: var(--text); text-decoration: none; line-height: 1.45; }
    li a:hover, li a:focus-visible { color: var(--accent-hover); }
    li.plain { color: var(--text-muted); }
    ion-icon { flex: none; font-size: 16px; margin-top: 1px; color: var(--accent); }
    .hint { display: block; margin: 2px 0 0 24px; font-size: 11px; color: var(--text-faint); }
    .cats { display: flex; flex-wrap: wrap; gap: 8px; }
    .cats a {
      padding: 5px 12px; border: 1px solid var(--border); border-radius: 999px;
      font-size: 12px; font-weight: 600; color: var(--text-muted); text-decoration: none;
    }
    .cats a:hover, .cats a:focus-visible { border-color: var(--accent); color: #fff; }
    .legal { margin-top: 24px; padding-top: 14px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-faint); }
  `],
})
export class SiteFooterComponent {
  /** Categorías con productos publicados, para enlazarlas. */
  readonly categories = input<string[]>([]);

  readonly c = CONTACTO;
  readonly year = new Date().getFullYear();

  constructor() {
    addIcons({
      'call-outline': callOutline,
      'card-outline': cardOutline,
      'cube-outline': cubeOutline,
      'location-outline': locationOutline,
      'logo-facebook': logoFacebook,
      'logo-instagram': logoInstagram,
      'logo-tiktok': logoTiktok,
      'logo-whatsapp': logoWhatsapp,
      'mail-outline': mailOutline,
      'time-outline': timeOutline,
    });
  }

  icono(red: string): string {
    return { Instagram: 'logo-instagram', Facebook: 'logo-facebook', TikTok: 'logo-tiktok' }[red] ?? 'globe-outline';
  }
}
