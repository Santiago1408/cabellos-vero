import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DemoStore, debtStatus } from '../../data/demo-store';
import { Icon } from '../icon/icon';

const dismissedBackupStorageKey = 'lmc-dismissed-backup-notice';
const readDismissedBackupKey = () => {
  if (typeof sessionStorage === 'undefined') return null;
  try { return sessionStorage.getItem(dismissedBackupStorageKey); }
  catch { return null; }
};

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  readonly store = inject(DemoStore);
  private readonly router = inject(Router);
  readonly mobileOpen = signal(false);
  readonly notifications = signal(false);
  readonly profileOpen = signal(false);
  readonly now = signal(Date.now());
  private readonly dismissedBackupKey = signal<string | null>(readDismissedBackupKey());
  readonly backupReminderKey = computed(() => this.store.nextBackupAt() ?? 'sin-respaldo');
  readonly showBackupReminder = computed(() => this.store.backupDue(this.now())
    && this.dismissedBackupKey() !== this.backupReminderKey());
  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
  get initials() { return this.store.displayName().split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase(); }
  get lowStockCount() { return this.store.managedProducts().filter(p => p.threshold > 0 && this.store.sellableWeight(p.id) <= p.threshold).length; }
  get overdueDebtCount() { return this.store.debts().filter(d => debtStatus(d) === 'Vencida').length; }
  dismissBackupReminder() {
    const key = this.backupReminderKey();
    this.dismissedBackupKey.set(key);
    if (typeof sessionStorage !== 'undefined') {
      try { sessionStorage.setItem(dismissedBackupStorageKey, key); }
      catch { /* El aviso queda oculto hasta cerrar esta instancia de la aplicación. */ }
    }
  }
  logout() {
    this.profileOpen.set(false);
    this.mobileOpen.set(false);
    this.store.logout();
    this.router.navigateByUrl('/ingresar');
  }
}
