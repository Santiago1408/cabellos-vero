import { Routes } from '@angular/router';
import { Shell } from './shared/shell/shell';

export const routes: Routes = [
  { path: 'ingresar', loadComponent: () => import('./pages/auth/auth').then(m => m.Auth) },
  { path: 'registro', loadComponent: () => import('./pages/auth/auth').then(m => m.Auth) },
  { path: '', component: Shell, children: [
    { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard) },
    { path: 'inventario', loadComponent: () => import('./pages/inventory/inventory').then(m => m.Inventory) },
    { path: 'inventario/:id', loadComponent: () => import('./pages/product-detail/product-detail').then(m => m.ProductDetail) },
    { path: 'proveedores', loadComponent: () => import('./pages/suppliers/suppliers').then(m => m.Suppliers) },
    { path: 'pedidos', loadComponent: () => import('./pages/orders/orders').then(m => m.Orders) },
    { path: 'ventas', loadComponent: () => import('./pages/sales/sales').then(m => m.Sales) },
    { path: 'deudas', loadComponent: () => import('./pages/debts/debts').then(m => m.Debts) },
    { path: 'reportes', loadComponent: () => import('./pages/reports/reports').then(m => m.Reports) },
    { path: 'configuracion', loadComponent: () => import('./pages/settings/settings').then(m => m.Settings) },
  ]},
  { path: '**', redirectTo: 'dashboard' },
];
