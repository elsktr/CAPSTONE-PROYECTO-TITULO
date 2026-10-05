import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { statsChartOutline, logOutOutline, cardOutline, warningOutline, barChartOutline, peopleOutline } from 'ionicons/icons';
import { errorMessage } from '../../core/api';
import { formatCLP, roleLabel } from '../../data/models';
import { AdminService } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon, IonButton],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded">
        <div class="page-title">
          <div class="section-title"><ion-icon name="stats-chart-outline"></ion-icon> Backoffice</div>
          <h1>Finanzas & RRHH</h1>
          <p class="text-muted">Vista ejecutiva de ventas proyectadas, mermas y permisos.</p>
        </div>

        <div class="logout-row">
          <ion-button class="btn-outline" (click)="logout()">
            <ion-icon slot="start" name="log-out-outline"></ion-icon>
            Cerrar sesión
          </ion-button>
        </div>

        <div class="load-error" *ngIf="error()" role="alert">
          <p>{{ error() }}</p>
          <ion-button class="btn-rockstar" [disabled]="loading()" (click)="load()">Reintentar</ion-button>
        </div>

        <div class="stats">
          <div class="stat-card">
            <div class="stat-head">
              <div class="stat-label">Ventas Proyectadas</div>
              <ion-icon name="card-outline" color="danger"></ion-icon>
            </div>
            <div class="stat-value">{{ formatCLP(admin.projectedSales()) }}</div>
            <div class="stat-note">Valor de venta del stock actual con precio</div>
          </div>
          <div class="stat-card">
            <div class="stat-head">
              <div class="stat-label">Pérdidas por Mermas</div>
              <ion-icon name="warning-outline" color="danger"></ion-icon>
            </div>
            <div class="stat-value">{{ formatCLP(admin.lossValue()) }}</div>
            <div class="stat-note">Valor de venta de las prendas dadas de baja</div>
          </div>
          <div class="stat-card">
            <div class="stat-head">
              <div class="stat-label">Eficiencia Operativa</div>
              <ion-icon name="bar-chart-outline" color="danger"></ion-icon>
            </div>
            <div class="stat-value">{{ admin.efficiency().toFixed(1) }}%</div>
            <div class="stat-note">Impacto neto de pérdidas</div>
          </div>
        </div>

        <div class="grid-2">
          <div class="card-rockstar" style="padding: 20px;">
            <div class="op-head">
              <div>
                <h3>Resumen operativo</h3>
                <p class="text-faint">Indicadores calculados con los datos del sistema.</p>
              </div>
              <ion-icon name="bar-chart-outline" color="danger"></ion-icon>
            </div>
            <div class="progress-list">
              <div class="progress">
                <div class="progress-head"><span>Eficiencia de inventario</span><strong>{{ admin.efficiency().toFixed(0) }}%</strong></div>
                <div class="bar"><div class="bar-fill" [style.width.%]="admin.efficiency()"></div></div>
              </div>
              <div class="progress">
                <div class="progress-head">
                  <span>Nivel de disponibilidad · prendas con unidades para vender</span>
                  <strong>{{ admin.availability().toFixed(0) }}%</strong>
                </div>
                <div class="bar"><div class="bar-fill" [style.width.%]="admin.availability()"></div></div>
              </div>
              <div class="progress">
                <div class="progress-head">
                  <span>Cumplimiento logístico · pedidos ya despachados</span>
                  <strong>{{ admin.fulfilment().toFixed(0) }}%</strong>
                </div>
                <div class="bar"><div class="bar-fill" [style.width.%]="admin.fulfilment()"></div></div>
              </div>
            </div>
          </div>

          <div class="card-rockstar" style="padding: 20px;">
            <div class="users-head">
              <ion-icon name="people-outline" color="danger"></ion-icon>
              <div>
                <h3>Usuarios & Roles</h3>
                <p class="text-faint">Cuentas del personal.</p>
              </div>
            </div>
            <div class="user-list">
              <div class="user-row" *ngFor="let u of admin.staff()">
                <div class="user-name">{{ u.nombre }}{{ u.activo ? '' : ' · desactivada' }}</div>
                <div class="user-email">{{ u.email }}</div>
                <div class="user-role">{{ roleLabel(u.rol) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    .page-title { margin-bottom: 16px; }
    .page-title h1 { margin: 8px 0; font-size: 28px; font-weight: 900; }
    .logout-row { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .load-error { text-align: center; padding: 16px; color: var(--text-muted); }
    .stats { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 20px; }
    @media (min-width: 768px) { .stats { grid-template-columns: repeat(3, 1fr); } }
    .stat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; }
    .stat-head { display: flex; justify-content: space-between; align-items: flex-start; }
    .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-faint); }
    .stat-value { font-size: 24px; font-weight: 900; margin: 16px 0 4px; }
    .stat-note { font-size: 11px; color: var(--text-faint); }
    .grid-2 { display: grid; grid-template-columns: 1fr; gap: 20px; }
    @media (min-width: 1024px) { .grid-2 { grid-template-columns: 2fr 1fr; } }
    .op-head, .users-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .users-head { gap: 8px; }
    .users-head h3, .op-head h3 { margin: 0; font-size: 16px; }
    .progress-list { display: flex; flex-direction: column; gap: 16px; }
    .progress-head { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; color: var(--text-muted); }
    .bar { height: 8px; background: #18181b; border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--accent); transition: width 0.4s; }
    .user-list { display: flex; flex-direction: column; gap: 8px; }
    .user-row { background: rgba(9, 9, 11, 0.4); border: 1px solid #18181b; border-radius: 12px; padding: 12px; }
    .user-name { font-size: 13px; font-weight: 600; }
    .user-email { font-size: 11px; color: var(--text-faint); margin-top: 2px; }
    .user-role { display: inline-block; margin-top: 8px; padding: 2px 8px; background: rgba(127, 29, 29, 0.3); color: #fca5a5; border-radius: 999px; font-size: 10px; font-weight: 700; }
  `],
})
export class AdminPage {
  admin = inject(AdminService);
  auth = inject(AuthService);
  cart = inject(CartService);
  router = inject(Router);

  formatCLP = formatCLP;
  roleLabel = roleLabel;
  loading = signal(false);
  error = signal('');

  constructor() {
    addIcons({
      'stats-chart-outline': statsChartOutline,
      'log-out-outline': logOutOutline,
      'card-outline': cardOutline,
      'warning-outline': warningOutline,
      'bar-chart-outline': barChartOutline,
      'people-outline': peopleOutline,
    });
    // Las cifras y las cuentas del personal son del Gerente; el backend rechaza a los demás roles.
    if (this.auth.rol() !== 'GERENTE') {
      this.router.navigateByUrl(this.auth.isAdmin() ? '/warehouse' : '/entry');
      return;
    }
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      await this.admin.loadFinance();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  logout() {
    this.auth.logout();
    this.cart.reset();
    this.router.navigateByUrl('/entry');
  }
}
