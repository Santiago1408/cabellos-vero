import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DemoStore } from './demo-store';

export const requireSession: CanActivateFn = () => {
  const store = inject(DemoStore);
  return store.role() ? true : inject(Router).createUrlTree(['/ingresar']);
};

export const requireAdmin: CanActivateFn = () => {
  const store = inject(DemoStore);
  if (store.role() === 'admin') return true;
  return inject(Router).createUrlTree([store.role() ? '/inventario' : '/ingresar']);
};

export const guestOnly: CanActivateFn = () => {
  const store = inject(DemoStore);
  if (!store.role()) return true;
  return inject(Router).createUrlTree([store.role() === 'admin' ? '/dashboard' : '/inventario']);
};
