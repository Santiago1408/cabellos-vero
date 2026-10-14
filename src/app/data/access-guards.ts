import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DemoStore } from './demo-store';

export const requireSession: CanActivateFn = (_route, state) => {
  const store = inject(DemoStore);
  const router = inject(Router);
  if (!store.role()) return router.createUrlTree(['/ingresar']);
  if (store.mustChangePassword() && state.url.split('?')[0] !== '/configuracion') {
    return router.createUrlTree(['/configuracion']);
  }
  return true;
};

export const requireAdmin: CanActivateFn = () => {
  const store = inject(DemoStore);
  if (store.role() === 'admin') return true;
  return inject(Router).createUrlTree([store.role() ? '/inventario' : '/ingresar']);
};

export const guestOnly: CanActivateFn = () => {
  const store = inject(DemoStore);
  if (!store.role()) return true;
  return inject(Router).createUrlTree([store.role() === 'admin' ? '/dashboard' : store.mustChangePassword() ? '/configuracion' : '/inventario']);
};
