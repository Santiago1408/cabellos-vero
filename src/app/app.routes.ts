import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./pages/landing/landing').then(m => m.Landing) },
  { path: 'sistema', loadComponent: () => import('./pages/connected-workspace/connected-workspace').then(m => m.ConnectedWorkspace) },
  { path: '**', redirectTo: '' },
];
