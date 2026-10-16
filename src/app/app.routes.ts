import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'sistema' },
  { path: 'sistema', loadComponent: () => import('./pages/connected-workspace/connected-workspace').then(m => m.ConnectedWorkspace) },
  { path: '**', redirectTo: 'sistema' },
];
