import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DemoStore, debtStatus } from '../../data/demo-store';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, Icon],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  readonly store = inject(DemoStore);
  readonly mobileOpen = signal(false);
  readonly notifications = signal(false);
  readonly profileOpen = signal(false);
  get initials() { return this.store.displayName().split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase(); }
  get lowStockCount() { return this.store.products().filter(p => p.quantity <= p.threshold).length; }
  get overdueDebtCount() { return this.store.debts().filter(d => debtStatus(d) === 'Vencida').length; }
  setRole(role: 'admin' | 'user') { this.store.role.set(role); this.profileOpen.set(false); }
}
