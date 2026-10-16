import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  statsChartOutline,
  logOutOutline,
  cardOutline,
  warningOutline,
  barChartOutline,
  peopleOutline,
  globeOutline,
  storefrontOutline,
  trendingUpOutline,
  speedometerOutline,
} from 'ionicons/icons';
import type { Rol, VentaResumen } from '@rockstar/contracts';
import { errorMessage } from '../../core/api';
import { formatCLP, roleLabel } from '../../data/models';
import { AdminService, SalesPeriod, periodStart } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';

/** Ventas que se muestran de una vez en la lista. */
const PAGE_SIZE = 10;
/** Días que muestra como máximo el gráfico de ventas por día. */
const CHART_MAX_DAYS = 60;
const DAY_MS = 86_400_000;

/** Ventas de un día, separadas por canal, para el gráfico. */
interface DayBar {
  day: string;
  label: string;
  web: number;
  pos: number;
  total: number;
}

/** Fecha de Chile (AAAA-MM-DD) de un instante. */
const chileDay = (date: Date) => date.toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });

/** Los días de `from` a `to`, ambos incluidos, en formato AAAA-MM-DD. */
function daysBetween(from: string, to: string): string[] {
  const [y, m, d] = from.split('-').map(Number);
  const days: string[] = [];
  for (let t = Date.UTC(y!, m! - 1, d!, 12); days.length <= CHART_MAX_DAYS; t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    days.push(day);
    if (day >= to) break;
  }
  return days;
}

/** Semáforo de un porcentaje: bien, atención o mal. */
type Level = 'ok' | 'warn' | 'bad';
const levelOf = (percent: number): Level => (percent >= 80 ? 'ok' : percent >= 50 ? 'warn' : 'bad');

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon, IonButton],
  template: `
    <ion-content class="rockstar-content" [fullscreen]="true">
      <div class="page-padded dash">
        <header class="hero">
          <div>
            <div class="eyebrow"><ion-icon name="stats-chart-outline"></ion-icon> Backoffice</div>
            <h1>Finanzas <span class="amp">&</span> RRHH</h1>
            <p>Vista ejecutiva de ventas, mermas y permisos.</p>
          </div>
          <ion-button class="btn-outline logout" (click)="logout()">
            <ion-icon slot="start" name="log-out-outline"></ion-icon>
            Cerrar sesión
          </ion-button>
        </header>

        <div class="load-error" *ngIf="error()" role="alert">
          <p>{{ error() }}</p>
          <ion-button class="btn-rockstar" [disabled]="loading()" (click)="load()">Reintentar</ion-button>
        </div>

        <section class="panel sales" aria-labelledby="ventas-titulo">
          <div class="panel-head">
            <div>
              <h2 id="ventas-titulo">Ventas</h2>
              <p>Ventas pagadas de la tienda web y de la tienda física (POS).</p>
            </div>
            <div class="periods" role="group" aria-label="Período de las ventas">
              <button
                *ngFor="let p of periods"
                type="button"
                [class.on]="period() === p.id"
                [attr.aria-pressed]="period() === p.id"
                [disabled]="salesLoading()"
                (click)="setPeriod(p.id)"
              >
                {{ p.label }}
              </button>
            </div>
          </div>

          <div class="kpis">
            <div class="kpi kpi-total">
              <span class="kpi-label"><ion-icon name="trending-up-outline" aria-hidden="true"></ion-icon> Total vendido</span>
              <strong>{{ formatCLP(admin.allSales().total) }}</strong>
              <small>
                {{ countLabel(admin.allSales().count) }}<ng-container *ngIf="admin.allSales().count > 0">
                  · ticket promedio {{ formatCLP(averageTicket()) }}</ng-container>
              </small>
            </div>
            <div class="kpi kpi-web">
              <span class="kpi-label"><span class="badge"><ion-icon name="globe-outline" aria-hidden="true"></ion-icon></span> Tienda web</span>
              <strong>{{ formatCLP(admin.webSales().total) }}</strong>
              <small>
                {{ countLabel(admin.webSales().count) }}<ng-container *ngIf="admin.shippingCharged() > 0">
                  · incluye {{ formatCLP(admin.shippingCharged()) }} de despacho</ng-container>
              </small>
            </div>
            <div class="kpi kpi-pos">
              <span class="kpi-label"><span class="badge"><ion-icon name="storefront-outline" aria-hidden="true"></ion-icon></span> Tienda física (POS)</span>
              <strong>{{ formatCLP(admin.storeSales().total) }}</strong>
              <small>{{ countLabel(admin.storeSales().count) }}</small>
            </div>
          </div>

          <figure class="chart" *ngIf="chart().length > 1" aria-label="Ventas por día">
            <div class="bars">
              <div
                class="bar-col"
                *ngFor="let d of chart(); let i = index"
                [attr.title]="d.label + ': web ' + formatCLP(d.web) + ' · POS ' + formatCLP(d.pos)"
              >
                <div class="stack" [style.height.%]="barHeight(d)">
                  <div class="seg pos" [style.flex-grow]="d.pos"></div>
                  <div class="seg web" [style.flex-grow]="d.web"></div>
                </div>
                <span class="tick" *ngIf="showTick(i)">{{ d.label }}</span>
              </div>
            </div>
            <figcaption class="legend">
              <span><i class="dot web"></i> Web {{ webShare().toFixed(0) }}%</span>
              <span><i class="dot pos"></i> POS {{ (100 - webShare()).toFixed(0) }}%</span>
              <span class="legend-note">Ventas por día</span>
            </figcaption>
          </figure>

          <ng-container *ngIf="chart().length <= 1 && admin.allSales().total > 0">
            <div class="share" aria-hidden="true"><div class="share-web" [style.width.%]="webShare()"></div></div>
            <div class="legend">
              <span><i class="dot web"></i> Web {{ webShare().toFixed(0) }}%</span>
              <span><i class="dot pos"></i> POS {{ (100 - webShare()).toFixed(0) }}%</span>
            </div>
          </ng-container>

          <div class="sales-list" *ngIf="admin.sales().length > 0; else noSales">
            <div class="sale-row" *ngFor="let v of visibleSales(); trackBy: trackSale" [class.pos]="v.canal === 'POS'">
              <span class="channel">{{ v.canal === 'POS' ? 'POS' : 'Web' }}</span>
              <div class="sale-main">
                <div class="sale-title">Venta #{{ v.idVenta }} · {{ who(v) }}</div>
                <div class="sale-meta">
                  {{ when(v.fecha) }} · {{ v.unidades }} {{ v.unidades === 1 ? 'unidad' : 'unidades' }}<ng-container *ngIf="v.medioPago">
                    · {{ v.medioPago }}</ng-container>
                </div>
              </div>
              <strong class="sale-total">{{ formatCLP(v.total) }}</strong>
            </div>
            <button type="button" class="more" *ngIf="admin.sales().length > visibleSales().length" (click)="showMore()">
              Ver más ventas ({{ admin.sales().length - visibleSales().length }})
            </button>
          </div>
          <ng-template #noSales>
            <p class="empty">{{ salesLoading() ? 'Cargando ventas…' : 'No hay ventas en este período.' }}</p>
          </ng-template>
        </section>

        <div class="stats">
          <div class="stat-card info">
            <span class="badge"><ion-icon name="card-outline" aria-hidden="true"></ion-icon></span>
            <div class="stat-label">Ventas proyectadas</div>
            <div class="stat-value">{{ formatCLP(admin.projectedSales()) }}</div>
            <div class="stat-note">Valor de venta del stock actual con precio</div>
          </div>
          <div class="stat-card warn">
            <span class="badge"><ion-icon name="warning-outline" aria-hidden="true"></ion-icon></span>
            <div class="stat-label">Pérdidas por mermas</div>
            <div class="stat-value">{{ formatCLP(admin.lossValue()) }}</div>
            <div class="stat-note">Valor de venta de las prendas dadas de baja</div>
          </div>
          <div class="stat-card ok">
            <span class="badge"><ion-icon name="speedometer-outline" aria-hidden="true"></ion-icon></span>
            <div class="stat-label">Eficiencia operativa</div>
            <div class="stat-value">{{ admin.efficiency().toFixed(1) }}%</div>
            <div class="stat-note">Impacto neto de pérdidas</div>
          </div>
        </div>

        <div class="grid-2">
          <section class="panel" aria-labelledby="resumen-titulo">
            <div class="panel-head">
              <div>
                <h2 id="resumen-titulo">Resumen operativo</h2>
                <p>Indicadores calculados con los datos del sistema.</p>
              </div>
              <span class="badge info"><ion-icon name="bar-chart-outline" aria-hidden="true"></ion-icon></span>
            </div>
            <div class="progress-list">
              <div class="progress" *ngFor="let m of indicators()" [ngClass]="m.level">
                <div class="progress-head"><span>{{ m.label }}</span><strong>{{ m.value.toFixed(0) }}%</strong></div>
                <div class="track"><div class="fill" [style.width.%]="m.value"></div></div>
              </div>
            </div>
          </section>

          <section class="panel" aria-labelledby="usuarios-titulo">
            <div class="panel-head">
              <div>
                <h2 id="usuarios-titulo">Usuarios & roles</h2>
                <p>Cuentas del personal.</p>
              </div>
              <span class="badge violet"><ion-icon name="people-outline" aria-hidden="true"></ion-icon></span>
            </div>
            <div class="user-list">
              <div class="user-row" *ngFor="let u of admin.staff()" [ngClass]="roleClass(u.rol)">
                <span class="avatar" aria-hidden="true">{{ initials(u.nombre) }}</span>
                <div class="user-main">
                  <div class="user-name">{{ u.nombre }}{{ u.activo ? '' : ' · desactivada' }}</div>
                  <div class="user-email">{{ u.email }}</div>
                </div>
                <span class="user-role">{{ roleLabel(u.rol) }}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ion-content>
  `,
  styles: [`
    :host {
      --c-web: #f43f5e;
      --c-pos: #f59e0b;
      --c-info: #38bdf8;
      --c-warn: #fb923c;
      --c-ok: #34d399;
      --c-bad: #f43f5e;
      --c-violet: #a78bfa;
      --panel: #131316;
      --panel-line: #26262b;
    }
    .dash { max-width: 1200px; margin: 0 auto; }

    .hero {
      display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px;
      margin-bottom: 20px; padding: 24px; border-radius: 20px;
      background:
        radial-gradient(120% 140% at 0% 0%, rgba(244, 63, 94, 0.28), transparent 55%),
        radial-gradient(120% 140% at 100% 100%, rgba(245, 158, 11, 0.18), transparent 55%),
        #111114;
      border: 1px solid var(--panel-line);
    }
    .eyebrow {
      display: inline-flex; align-items: center; gap: 6px;
      color: #fda4af; font-size: 11px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase;
    }
    .hero h1 { margin: 8px 0 6px; font-size: 30px; font-weight: 900; letter-spacing: -0.01em; }
    .hero .amp { color: var(--c-pos); }
    .hero p { margin: 0; color: var(--text-muted); font-size: 14px; }
    .logout { margin: 0; }

    .load-error { text-align: center; padding: 16px; color: var(--text-muted); }

    .panel { background: var(--panel); border: 1px solid var(--panel-line); border-radius: 18px; padding: 20px; }
    .panel-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
    .panel-head h2 { margin: 0; font-size: 17px; font-weight: 800; }
    .panel-head p { margin: 4px 0 0; font-size: 12px; color: var(--text-faint); }
    .sales { margin-bottom: 20px; }

    .badge {
      display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 9px;
      font-size: 16px; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent);
    }
    .badge.info { --c: var(--c-info); }
    .badge.violet { --c: var(--c-violet); }

    .periods { display: flex; gap: 4px; padding: 4px; background: #0b0b0d; border: 1px solid var(--panel-line); border-radius: 12px; }
    .periods button {
      padding: 7px 12px; border: none; border-radius: 8px; background: transparent;
      color: var(--text-muted); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .periods button:hover { color: #fff; }
    .periods button.on { background: linear-gradient(135deg, #e11d48, #f97316); color: #fff; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.35); }
    .periods button:focus-visible, .more:focus-visible { outline: 2px solid var(--c-pos); outline-offset: 2px; }

    .kpis { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 768px) { .kpis { grid-template-columns: 1.3fr 1fr 1fr; } }
    .kpi {
      --c: var(--text-muted);
      display: flex; flex-direction: column; gap: 6px; padding: 16px; border-radius: 14px;
      background: color-mix(in srgb, var(--c) 7%, #0e0e11);
      border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
    }
    .kpi-web { --c: var(--c-web); }
    .kpi-pos { --c: var(--c-pos); }
    .kpi .badge { width: 24px; height: 24px; font-size: 13px; border-radius: 7px; }
    .kpi-label {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted);
    }
    .kpi strong { font-size: 24px; font-weight: 900; color: #fff; }
    .kpi-web strong, .kpi-pos strong { color: var(--c); }
    .kpi small { font-size: 11px; color: var(--text-faint); }
    .kpi-total {
      border: none; color: #fff;
      background: linear-gradient(135deg, #be123c 0%, #e11d48 45%, #f97316 100%);
      box-shadow: 0 10px 30px rgba(225, 29, 72, 0.25);
    }
    .kpi-total .kpi-label, .kpi-total small { color: rgba(255, 255, 255, 0.85); }
    .kpi-total strong { font-size: 30px; }

    .chart { margin: 18px 0 0; }
    .bars { display: flex; align-items: flex-end; gap: 3px; height: 140px; padding: 0 2px; border-bottom: 1px solid var(--panel-line); }
    .bar-col { position: relative; flex: 1; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
    .stack {
      width: 100%; min-height: 0; display: flex; flex-direction: column; border-radius: 4px 4px 0 0; overflow: hidden;
      transition: height 0.4s;
    }
    .bar-col:hover .stack { filter: brightness(1.25); }
    .seg { flex-basis: 0; }
    .seg.web { background: linear-gradient(180deg, #fb7185, var(--c-web)); }
    .seg.pos { background: linear-gradient(180deg, #fcd34d, var(--c-pos)); }
    .tick {
      position: absolute; top: calc(100% + 4px); left: 50%; transform: translateX(-50%);
      font-size: 9px; color: var(--text-faint); white-space: nowrap;
    }
    .legend { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 22px; font-size: 11px; color: var(--text-muted); }
    .legend-note { margin-left: auto; color: var(--text-faint); }
    .dot { display: inline-block; width: 8px; height: 8px; margin-right: 4px; border-radius: 50%; }
    .dot.web { background: var(--c-web); }
    .dot.pos { background: var(--c-pos); }
    .share { display: flex; height: 8px; margin-top: 18px; background: var(--c-pos); border-radius: 999px; overflow: hidden; }
    .share-web { background: var(--c-web); transition: width 0.4s; }
    .share + .legend { margin-top: 8px; }

    .sales-list { display: flex; flex-direction: column; gap: 8px; margin-top: 18px; }
    .sale-row {
      --c: var(--c-web);
      display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px;
      background: #0e0e11; border: 1px solid var(--panel-line); border-left: 3px solid var(--c);
      transition: border-color 0.15s, background 0.15s;
    }
    .sale-row.pos { --c: var(--c-pos); }
    .sale-row:hover { background: #151519; }
    .channel {
      flex: none; min-width: 40px; padding: 3px 8px; text-align: center; border-radius: 999px;
      background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); font-size: 10px; font-weight: 800;
    }
    .sale-main { flex: 1; min-width: 0; }
    .sale-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sale-meta { font-size: 11px; color: var(--text-faint); margin-top: 2px; }
    .sale-total { flex: none; font-size: 14px; color: #fff; }
    .more {
      align-self: center; margin-top: 4px; padding: 8px 14px; background: transparent;
      border: 1px solid var(--panel-line); border-radius: 10px; color: var(--text-muted); font: inherit; font-size: 12px; cursor: pointer;
    }
    .more:hover { border-color: var(--c-pos); color: #fff; }
    .empty { margin: 16px 0 0; font-size: 13px; color: var(--text-faint); }

    .stats { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 20px; }
    @media (min-width: 768px) { .stats { grid-template-columns: repeat(3, 1fr); } }
    .stat-card {
      position: relative; overflow: hidden; padding: 18px; border-radius: 16px;
      background: linear-gradient(160deg, color-mix(in srgb, var(--c) 14%, #111114) 0%, #111114 60%);
      border: 1px solid color-mix(in srgb, var(--c) 28%, transparent);
    }
    .stat-card.info { --c: var(--c-info); }
    .stat-card.warn { --c: var(--c-warn); }
    .stat-card.ok { --c: var(--c-ok); }
    .stat-card .badge { position: absolute; top: 16px; right: 16px; }
    .stat-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
    .stat-value { font-size: 26px; font-weight: 900; margin: 14px 0 4px; color: var(--c); }
    .stat-note { font-size: 11px; color: var(--text-faint); }

    .grid-2 { display: grid; grid-template-columns: 1fr; gap: 20px; }
    @media (min-width: 1024px) { .grid-2 { grid-template-columns: 3fr 2fr; } }

    .progress-list { display: flex; flex-direction: column; gap: 18px; }
    .progress { --c: var(--c-ok); }
    .progress.warn { --c: var(--c-pos); }
    .progress.bad { --c: var(--c-bad); }
    .progress-head { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; margin-bottom: 7px; color: var(--text-muted); }
    .progress-head strong { color: var(--c); font-size: 13px; }
    .track { height: 10px; background: #0b0b0d; border: 1px solid var(--panel-line); border-radius: 999px; overflow: hidden; }
    .fill {
      height: 100%; border-radius: 999px; transition: width 0.5s;
      background: linear-gradient(90deg, color-mix(in srgb, var(--c) 55%, transparent), var(--c));
      box-shadow: 0 0 12px color-mix(in srgb, var(--c) 50%, transparent);
    }

    .user-list { display: flex; flex-direction: column; gap: 8px; }
    .user-row {
      --c: var(--text-muted);
      display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px;
      background: #0e0e11; border: 1px solid var(--panel-line);
    }
    .user-row.gerente { --c: var(--c-violet); }
    .user-row.bodega { --c: var(--c-info); }
    .user-row.vendedor { --c: var(--c-pos); }
    .avatar {
      flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%;
      background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--c);
      border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
      font-size: 13px; font-weight: 800;
    }
    .user-main { flex: 1; min-width: 0; }
    .user-name { font-size: 13px; font-weight: 600; }
    .user-email { font-size: 11px; color: var(--text-faint); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .user-role {
      flex: none; padding: 3px 9px; border-radius: 999px; font-size: 10px; font-weight: 800;
      background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c);
    }

    @media (max-width: 480px) {
      .hero { padding: 18px; }
      .hero h1 { font-size: 24px; }
      .kpi-total strong { font-size: 26px; }
      .bars { height: 110px; gap: 2px; }
    }
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

  readonly periods: { id: SalesPeriod; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: '7 días' },
    { id: 'month', label: '30 días' },
    { id: 'all', label: 'Todo' },
  ];
  period = signal<SalesPeriod>('month');
  salesLoading = signal(false);
  private readonly shown = signal(PAGE_SIZE);
  visibleSales = computed(() => this.admin.sales().slice(0, this.shown()));
  /** Parte del total vendido que entró por la tienda web. */
  webShare = computed(() => {
    const all = this.admin.allSales().total;
    return all ? (this.admin.webSales().total / all) * 100 : 0;
  });
  averageTicket = computed(() => {
    const { total, count } = this.admin.allSales();
    return count ? Math.round(total / count) : 0;
  });

  /** Ventas por día del período, con los días sin ventas en cero. Vacío para "Hoy" (un solo día). */
  chart = computed<DayBar[]>(() => {
    const sales = this.admin.sales();
    if (this.period() === 'today' || sales.length === 0) {
      return [];
    }
    const today = chileDay(new Date());
    const oldest = chileDay(new Date(sales[sales.length - 1]!.fecha));
    const limit = chileDay(new Date(Date.now() - (CHART_MAX_DAYS - 1) * DAY_MS));
    const from = [periodStart(this.period()) ?? oldest, limit].sort().pop()!;
    const bars = new Map<string, DayBar>(
      daysBetween(from, today).map((day) => [day, { day, label: `${day.slice(8, 10)}/${day.slice(5, 7)}`, web: 0, pos: 0, total: 0 }]),
    );
    for (const sale of sales) {
      const bar = bars.get(chileDay(new Date(sale.fecha)));
      if (bar) {
        bar[sale.canal === 'POS' ? 'pos' : 'web'] += sale.total;
        bar.total += sale.total;
      }
    }
    return [...bars.values()];
  });
  private readonly chartMax = computed(() => Math.max(1, ...this.chart().map((d) => d.total)));

  /** Indicadores del resumen operativo, con su color de semáforo. */
  indicators = computed(() =>
    [
      { label: 'Eficiencia de inventario', value: this.admin.efficiency() },
      { label: 'Nivel de disponibilidad · prendas con unidades para vender', value: this.admin.availability() },
      { label: 'Cumplimiento logístico · pedidos ya despachados', value: this.admin.fulfilment() },
    ].map((m) => ({ ...m, level: levelOf(m.value) })),
  );

  constructor() {
    addIcons({
      'stats-chart-outline': statsChartOutline,
      'log-out-outline': logOutOutline,
      'card-outline': cardOutline,
      'warning-outline': warningOutline,
      'bar-chart-outline': barChartOutline,
      'people-outline': peopleOutline,
      'globe-outline': globeOutline,
      'storefront-outline': storefrontOutline,
      'trending-up-outline': trendingUpOutline,
      'speedometer-outline': speedometerOutline,
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
      await this.admin.loadFinance(this.period());
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async setPeriod(period: SalesPeriod) {
    if (period === this.period()) return;
    this.period.set(period);
    this.shown.set(PAGE_SIZE);
    this.salesLoading.set(true);
    this.error.set('');
    try {
      await this.admin.loadSales(period);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.salesLoading.set(false);
    }
  }

  showMore() {
    this.shown.update((n) => n + PAGE_SIZE);
  }

  /** Alto de la barra de un día; un día con ventas siempre se alcanza a ver. */
  barHeight(day: DayBar): number {
    return day.total === 0 ? 0 : Math.max(4, (day.total / this.chartMax()) * 100);
  }

  /** Muestra algunas fechas bajo el gráfico, sin que se encimen. */
  showTick(index: number): boolean {
    const n = this.chart().length;
    const step = Math.ceil(n / 7);
    return index === n - 1 || (index % step === 0 && n - 1 - index >= step / 2);
  }

  /** En la web la venta es del cliente; en el POS se muestra además quién la registró. */
  who(sale: VentaResumen): string {
    if (sale.canal === 'POS') {
      return sale.cliente ? `${sale.cliente} (atendió ${sale.vendedor})` : `Atendió ${sale.vendedor}`;
    }
    return sale.cliente ?? 'Cliente';
  }

  when(fecha: string): string {
    return new Date(fecha).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short' });
  }

  countLabel(count: number): string {
    return count === 1 ? '1 venta' : `${count} ventas`;
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('');
  }

  roleClass(rol: Rol): string {
    return rol.toLowerCase();
  }

  trackSale(_: number, sale: VentaResumen) {
    return sale.idVenta;
  }

  logout() {
    this.auth.logout();
    this.cart.reset();
    this.router.navigateByUrl('/entry');
  }
}
