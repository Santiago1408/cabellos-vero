import { Routes } from '@angular/router';
import { Shell } from './shared/shell';

export const routes: Routes = [
  { path: 'ingresar', loadComponent: () => import('./pages/auth').then(m => m.Auth) },
  { path: 'registro', loadComponent: () => import('./pages/auth').then(m => m.Auth) },
  { path: '', component: Shell, children: [
    { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    { path: 'dashboard', loadComponent: () => import('./pages/dashboard').then(m => m.Dashboard) },
    { path: 'inventario', loadComponent: () => import('./pages/inventory').then(m => m.Inventory) },
    { path: 'inventario/:id', loadComponent: () => import('./pages/product-detail').then(m => m.ProductDetail) },
    { path: 'proveedores', loadComponent: () => import('./pages/suppliers').then(m => m.Suppliers) },
    { path: 'pedidos', loadComponent: () => import('./pages/orders').then(m => m.Orders) },
    { path: 'reportes', loadComponent: () => import('./pages/reports').then(m => m.Reports) },
    { path: 'tienda', loadComponent: () => import('./pages/store-page').then(m => m.StorePage) },
    { path: 'configuracion', loadComponent: () => import('./pages/settings').then(m => m.Settings) },
  ]},
  { path: '**', redirectTo: 'dashboard' },
];
