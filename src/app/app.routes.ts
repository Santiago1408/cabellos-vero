import { Routes } from '@angular/router';
import { Shell } from './shared/shell/shell';
import { guestOnly, requireAdmin, requireSession } from './data/access-guards';

export const routes: Routes = [
  { path: 'sistema', loadComponent: () => import('./pages/connected-workspace/connected-workspace').then(m => m.ConnectedWorkspace) },
  { path: 'ingresar', canActivate: [guestOnly], loadComponent: () => import('./pages/auth/auth').then(m => m.Auth) },
  { path: 'registro', redirectTo: 'ingresar' },
  { path: '', component: Shell, canActivate: [requireSession], canActivateChild: [requireSession], children: [
    { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    { path: 'dashboard', canActivate: [requireAdmin], loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard) },
    { path: 'inventario', loadComponent: () => import('./pages/inventory/inventory').then(m => m.Inventory) },
    { path: 'inventario/:id', loadComponent: () => import('./pages/product-detail/product-detail').then(m => m.ProductDetail) },
    { path: 'proveedores', canActivate: [requireAdmin], loadComponent: () => import('./pages/suppliers/suppliers').then(m => m.Suppliers) },
    { path: 'pedidos', loadComponent: () => import('./pages/orders/orders').then(m => m.Orders) },
    { path: 'ventas', loadComponent: () => import('./pages/sales/sales').then(m => m.Sales) },
    { path: 'deudas', canActivate: [requireAdmin], loadComponent: () => import('./pages/debts/debts').then(m => m.Debts) },
    { path: 'reportes', loadComponent: () => import('./pages/reports/reports').then(m => m.Reports) },
    { path: 'empleados', canActivate: [requireAdmin], loadComponent: () => import('./pages/employees/employees').then(m => m.Employees) },
    { path: 'configuracion', loadComponent: () => import('./pages/settings/settings').then(m => m.Settings) },
  ]},
  { path: '**', redirectTo: 'dashboard' },
];
