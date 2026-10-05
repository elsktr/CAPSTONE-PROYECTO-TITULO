import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'entry', pathMatch: 'full' },
  {
    path: 'entry',
    loadComponent: () => import('./pages/entry/entry.page').then((m) => m.EntryPage),
  },
  {
    path: 'shop',
    loadComponent: () => import('./pages/shop/shop.page').then((m) => m.ShopPage),
  },
  {
    path: 'bandas',
    loadComponent: () => import('./pages/bandas/bandas.page').then((m) => m.BandasPage),
  },
  {
    path: 'cart',
    loadComponent: () => import('./pages/cart/cart.page').then((m) => m.CartPage),
  },
  {
    path: 'pago',
    loadComponent: () => import('./pages/pago/pago.page').then((m) => m.PagoPage),
  },
  {
    path: 'pedidos',
    loadComponent: () => import('./pages/pedidos/pedidos.page').then((m) => m.PedidosPage),
  },
  {
    path: 'perfil',
    loadComponent: () => import('./pages/perfil/perfil.page').then((m) => m.PerfilPage),
  },
  {
    path: 'warehouse',
    loadComponent: () => import('./pages/warehouse/warehouse.page').then((m) => m.WarehousePage),
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/admin.page').then((m) => m.AdminPage),
  },
  {
    path: 'support',
    loadComponent: () => import('./pages/support/support.page').then((m) => m.SupportPage),
  },
  { path: '**', redirectTo: 'entry' },
];
