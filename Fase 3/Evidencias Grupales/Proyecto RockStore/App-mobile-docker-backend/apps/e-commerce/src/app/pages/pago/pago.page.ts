import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonButton, IonIcon } from '@ionic/angular/standalone';
import type { CheckoutResponse, ResultadoPago } from '@rockstar/contracts';
import { addIcons } from 'ionicons';
import { cardOutline, checkmarkCircleOutline, closeCircleOutline, lockClosedOutline, timeOutline } from 'ionicons/icons';
import { errorMessage } from '../../core/api';
import { formatCLP } from '../../data/models';
import { CartService } from '../../services/cart.service';
import { ProductsService } from '../../services/products.service';
import { ShopApi } from '../../services/shop.api';

/**
 * Pago de la compra. Con Webpay (la compra trae `urlPago`) envía al comprador al formulario
 * de Transbank, y al volver (`/pago?token_ws=…`) informa al backend cómo terminó. Con la
 * pasarela simulada no pide tarjeta ni cobra: quien prueba elige si el pago se aprueba.
 */
@Component({
  selector: 'app-pago',
  standalone: true,
  imports: [CommonModule, RouterLink, IonContent, IonButton, IonIcon],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded">
        <div class="pay-card center" *ngIf="confirming()">
          <div class="spinner" aria-hidden="true"></div>
          <h1>Confirmando tu pago…</h1>
          <p class="text-muted">Estamos consultando a Webpay cómo terminó el pago. No cierres esta página.</p>
          <p class="error-msg" *ngIf="error()" role="alert">{{ error() }}</p>
          <ion-button *ngIf="error()" expand="block" class="btn-rockstar" (click)="retryConfirm()">Reintentar</ion-button>
        </div>

        <div class="pay-card" *ngIf="!confirming() && !result() && purchase() as p">
          <div class="section-title"><ion-icon name="card-outline"></ion-icon> Pago</div>
          <h1>Compra #{{ p.idVenta }}</h1>
          <div class="rows">
            <div class="row"><span>Productos</span><span>{{ formatCLP(p.subtotal) }}</span></div>
            <div class="row"><span>Despacho</span><span>{{ formatCLP(p.flete) }}</span></div>
            <div class="row grand"><span>Total a pagar</span><span class="text-accent">{{ formatCLP(p.total) }}</span></div>
          </div>

          <ng-container *ngIf="p.urlPago; else simulated">
            <div class="webpay">
              <span class="webpay-brand">webpay<b>plus</b></span>
              <p>
                <ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon>
                Pagarás en el sitio seguro de Transbank con débito, crédito o prepago. La tienda nunca ve los datos de tu tarjeta.
              </p>
            </div>
            <div class="test-note" *ngIf="isTestEnvironment(p)">
              <strong>Ambiente de prueba de Transbank:</strong> no se cobra dinero real. Usa la tarjeta VISA
              <code>4051 8856 0044 6623</code>, CVV <code>123</code> y cualquier fecha futura. Si te pide RUT y clave:
              <code>11.111.111-1</code> y <code>123</code>. En el banco de prueba puedes elegir aceptar o rechazar el pago.
            </div>
            <p class="error-msg" *ngIf="error()" role="alert">{{ error() }}</p>
            <ion-button expand="block" class="btn-rockstar" [disabled]="busy()" (click)="goToWebpay(p)">
              {{ busy() ? 'Abriendo Webpay…' : 'Pagar con Webpay' }}
            </ion-button>
          </ng-container>

          <ng-template #simulated>
            <p class="sim-note">
              Pasarela de pago simulada: no se pide tarjeta ni se cobra dinero. Elige cómo termina el pago.
            </p>
            <p class="error-msg" *ngIf="error()" role="alert">{{ error() }}</p>
            <ion-button expand="block" class="btn-rockstar" [disabled]="busy()" (click)="pay(true)">
              {{ busy() ? 'Procesando…' : 'Aprobar pago' }}
            </ion-button>
            <ion-button expand="block" class="btn-outline" [disabled]="busy()" (click)="pay(false)">Rechazar pago</ion-button>
          </ng-template>

          <p class="hold-note">
            <ion-icon name="time-outline"></ion-icon>
            Tus productos están reservados hasta las {{ holdUntil(p) }}.
          </p>
        </div>

        <div class="pay-card center" *ngIf="result() as r">
          <ng-container *ngIf="r.estado === 'PAGADA'">
            <ion-icon class="big ok" name="checkmark-circle-outline"></ion-icon>
            <h1>¡Compra confirmada!</h1>
            <p class="text-muted">Tu pedido es el <strong>#{{ r.idPedido }}</strong>. Pagaste {{ formatCLP(r.total) }}.</p>
            <p class="text-faint small">Código de autorización {{ r.codigoAutorizacion }}</p>
            <ion-button expand="block" class="btn-rockstar" routerLink="/pedidos">Ver mis pedidos</ion-button>
            <ion-button expand="block" class="btn-outline" routerLink="/shop">Seguir comprando</ion-button>
          </ng-container>
          <ng-container *ngIf="r.estado === 'RECHAZADA'">
            <ion-icon class="big bad" name="close-circle-outline"></ion-icon>
            <h1>Pago no realizado</h1>
            <p class="text-muted">{{ r.motivo }}</p>
            <p class="text-faint small">No se hizo ningún cobro. Tu carrito conserva sus productos.</p>
            <ion-button expand="block" class="btn-rockstar" routerLink="/cart">Volver al carrito</ion-button>
          </ng-container>
          <ng-container *ngIf="r.estado === 'EXPIRADA'">
            <ion-icon class="big bad" name="time-outline"></ion-icon>
            <h1>La reserva venció</h1>
            <p class="text-muted">Pasaron más de 15 minutos sin pagar y los productos volvieron a la tienda.</p>
            <p class="text-faint small">No se hizo ningún cobro. Tu carrito conserva sus productos.</p>
            <ion-button expand="block" class="btn-rockstar" routerLink="/cart">Volver al carrito</ion-button>
          </ng-container>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .pay-card {
      max-width: 480px; margin: 24px auto;
      background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 24px;
    }
    .pay-card.center { text-align: center; }
    h1 { margin: 8px 0 16px; font-size: 24px; font-weight: 900; }
    .rows { display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; justify-content: space-between; font-size: 14px; color: var(--text-muted); }
    .row.grand { font-size: 18px; font-weight: 900; color: var(--text); padding-top: 10px; border-top: 1px solid var(--border); }
    .sim-note {
      margin: 20px 0 4px; padding: 12px; border-radius: 12px;
      border: 1px dashed var(--border); color: var(--text-muted); font-size: 13px; line-height: 1.5;
    }
    .webpay {
      margin: 20px 0 0; padding: 14px; border-radius: 12px; background: #fff; color: #333;
      display: flex; flex-direction: column; gap: 8px;
    }
    .webpay-brand { font-size: 22px; font-weight: 800; color: #d5006c; letter-spacing: -0.5px; }
    .webpay-brand b { color: #333; font-weight: 400; margin-left: 2px; }
    .webpay p { margin: 0; font-size: 13px; line-height: 1.5; display: flex; gap: 8px; align-items: flex-start; }
    .webpay ion-icon { flex: none; margin-top: 2px; font-size: 16px; color: #2e7d32; }
    .test-note {
      margin: 12px 0 0; padding: 12px; border-radius: 12px; font-size: 12px; line-height: 1.6;
      border: 1px dashed rgba(234, 179, 8, 0.5); background: rgba(133, 77, 14, 0.18); color: var(--text-muted);
    }
    .test-note code { color: var(--text); font-weight: 700; }
    .btn-rockstar { margin-top: 12px; }
    .btn-outline { margin-top: 8px; }
    .hold-note { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 16px 0 0; font-size: 12px; color: var(--text-faint); }
    .error-msg {
      margin: 12px 0 0; padding: 10px 12px; border-radius: 8px;
      background: rgba(127, 29, 29, 0.3); border: 1px solid #7f1d1d; color: #fca5a5; font-size: 13px;
    }
    .spinner {
      width: 48px; height: 48px; margin: 8px auto 0; border-radius: 50%;
      border: 4px solid var(--border); border-top-color: var(--accent); animation: girar 0.9s linear infinite;
    }
    @keyframes girar { to { transform: rotate(360deg); } }
    .big { font-size: 64px; }
    .big.ok { color: var(--success); }
    .big.bad { color: var(--accent-hover); }
    .small { font-size: 12px; }
  `],
})
export class PagoPage {
  cart = inject(CartService);
  products = inject(ProductsService);
  api = inject(ShopApi);
  router = inject(Router);
  route = inject(ActivatedRoute);

  purchase = this.cart.pending;
  result = signal<ResultadoPago | null>(null);
  busy = signal(false);
  /** Se está informando al backend el regreso desde Webpay. */
  confirming = signal(false);
  error = signal('');
  formatCLP = formatCLP;

  /** Regreso desde Webpay por confirmar: con él se puede reintentar si falla la conexión. */
  private webpayReturn: { token: string; cancelled: boolean; timedOut: boolean } | null = null;

  constructor() {
    addIcons({
      'card-outline': cardOutline,
      'checkmark-circle-outline': checkmarkCircleOutline,
      'close-circle-outline': closeCircleOutline,
      'lock-closed-outline': lockClosedOutline,
      'time-outline': timeOutline,
    });
    const query = this.route.snapshot.queryParamMap;
    const token = query.get('token_ws');
    if (token) {
      this.webpayReturn = { token, cancelled: query.get('anulado') === '1', timedOut: false };
    } else if (query.get('agotado') === '1' && this.purchase()) {
      // Sin token: se le acabó el tiempo en Webpay. Se cierra la compra que estaba pagando.
      this.webpayReturn = { token: this.purchase()!.tokenPago, cancelled: true, timedOut: true };
    }
    if (this.webpayReturn) {
      void this.retryConfirm();
    } else if (!this.purchase()) {
      this.router.navigateByUrl('/cart');
    }
  }

  holdUntil(purchase: CheckoutResponse): string {
    return new Date(purchase.expiraEn).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }

  /** El ambiente de integración de Transbank acepta solo tarjetas de prueba. */
  isTestEnvironment(purchase: CheckoutResponse): boolean {
    return purchase.urlPago?.includes('webpay3gint.') ?? false;
  }

  /** Envía al comprador al formulario de Webpay: un POST con el token, como pide Transbank. */
  goToWebpay(purchase: CheckoutResponse) {
    if (!purchase.urlPago || this.busy()) return;
    this.busy.set(true);
    // Si el comprador vuelve con el botón Atrás, el navegador restaura esta página tal cual: el botón se reactiva.
    window.addEventListener('pageshow', () => this.busy.set(false), { once: true });
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = purchase.urlPago;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'token_ws';
    input.value = purchase.tokenPago;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }

  /** Informa al backend el regreso desde Webpay. Repetirlo responde lo ya resuelto. */
  async retryConfirm() {
    const back = this.webpayReturn;
    if (!back) return;
    this.confirming.set(true);
    this.error.set('');
    try {
      const result = await this.api.resolvePayment(back.token, { anulado: back.cancelled });
      this.webpayReturn = null;
      this.showResult(
        back.timedOut && result.estado === 'RECHAZADA'
          ? { ...result, motivo: 'Se acabó el tiempo para pagar en Webpay.' }
          : result,
        back.token,
      );
      // El token ya no sirve en la dirección: recargar la página no debe repetir nada.
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      this.confirming.set(false);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  /** Pago simulado: informa al backend cómo terminó. Repetirlo responde lo ya resuelto, así que se puede reintentar. */
  async pay(approve: boolean) {
    const purchase = this.purchase();
    if (!purchase || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.showResult(await this.api.resolvePayment(purchase.tokenPago, { aprobar: approve }), purchase.tokenPago);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private showResult(result: ResultadoPago, token: string) {
    this.result.set(result);
    // Solo se cierra la compra pendiente de esta pestaña si es la que se pagó.
    if (this.purchase()?.tokenPago === token) {
      this.cart.finishPayment(result.estado === 'PAGADA');
    }
    // Lo vendido, o lo liberado, cambia la disponibilidad que muestra la tienda.
    void this.products.load();
  }
}
