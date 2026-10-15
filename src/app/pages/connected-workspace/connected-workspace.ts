import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe, registerLocaleData } from '@angular/common';
import localeEsBo from '@angular/common/locales/es-BO';
import { Component, computed, inject, LOCALE_ID, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../data/api-client';
import { AuthSession } from '../../data/auth-session';
import { ConnectedSuppliers } from './connected-suppliers';
import { ConnectedPurchases } from './connected-purchases';
import { ConnectedSales } from './connected-sales';
import { ConnectedReports } from './connected-reports';
import { ConnectedDashboard } from './connected-dashboard';
import { ConnectedDebts } from './connected-debts';
import { ConnectedEmployees } from './connected-employees';
import { ConnectedSettings } from './connected-settings';
import { BackupSettings } from '../../data/backup-api';
import { Icon } from '../../shared/icon/icon';

type Category = { code: string; displayName: string };
type Length = { centimeters: number };
type StockRow = {
  categoryCode: string;
  categoryName: string;
  lengthCm: number;
  physicalStock: number;
  pendingPurchase: number;
  reservedSale: number;
  freePhysical: number;
};
type StockMovement = {
  id: string; kind: string; effectiveAt: string; recordedAt: string; operationId: string;
  partyName: string; weight: number; signedWeight: number; pricePerGram: number;
  total: number; runningPhysicalStock: number;
};
type StockDetail = { stock: StockRow; movements: StockMovement[] };
type InventorySort = 'category' | 'length' | 'quantity';

registerLocaleData(localeEsBo);

@Component({
  selector: 'app-connected-workspace',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, ConnectedSuppliers, ConnectedPurchases, ConnectedSales, ConnectedReports, ConnectedDashboard, ConnectedDebts, ConnectedEmployees, ConnectedSettings, Icon],
  providers: [{ provide: LOCALE_ID, useValue: 'es-BO' }],
  templateUrl: './connected-workspace.html',
  styleUrls: ['./connected-workspace.css', '../../shared/shell/shell.css', '../../shared/operation.css'],
})
export class ConnectedWorkspace implements OnInit {
  readonly session = inject(AuthSession);
  private readonly api = inject(ApiClient);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly dataLoaded = signal(false);
  readonly categories = signal<Category[]>([]);
  readonly lengths = signal<Length[]>([]);
  readonly stock = signal<StockRow[]>([]);
  readonly inventorySort = signal<InventorySort>('category');
  readonly inventoryDirection = signal<1 | -1>(1);
  readonly sortedStock = computed(() => [...this.stock()].sort((left, right) => {
    const key = this.inventorySort();
    const comparison = key === 'category' ? left.categoryName.localeCompare(right.categoryName, 'es-BO')
      : key === 'length' ? left.lengthCm - right.lengthCm : left.physicalStock - right.physicalStock;
    return this.inventoryDirection() * (comparison || left.lengthCm - right.lengthCm);
  }));
  readonly typesOpen = signal(false);
  readonly stockDetail = signal<StockDetail | null>(null);
  readonly stockDetailError = signal('');
  readonly section = signal<'dashboard' | 'inventory' | 'suppliers' | 'purchases' | 'sales' | 'reports' | 'debts' | 'employees' | 'settings'>('inventory');
  readonly mobileOpen = signal(false);
  readonly profileOpen = signal(false);
  readonly backupDue = signal(false);
  readonly backupDismissed = signal(false);
  readonly message = signal('');
  categoryDraft = '';
  lengthDraft: number | null = null;
  username = '';
  password = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  get initials(): string {
    return (this.session.account()?.displayName ?? 'MC').split(/\s+/).slice(0, 2)
      .map(part => part[0] ?? '').join('').toUpperCase();
  }

  selectSection(value: 'dashboard' | 'inventory' | 'suppliers' | 'purchases' | 'sales' | 'reports' | 'debts' | 'employees' | 'settings'): void {
    if (this.session.account()?.role !== 'ADMIN' && ['dashboard', 'suppliers', 'debts', 'employees'].includes(value)) return;
    this.section.set(value);
    this.mobileOpen.set(false);
    this.profileOpen.set(false);
    if (value === 'inventory') void this.refresh();
  }

  sortInventory(key: InventorySort): void {
    if (this.inventorySort() === key) this.inventoryDirection.update(value => value === 1 ? -1 : 1);
    else { this.inventorySort.set(key); this.inventoryDirection.set(1); }
  }

  inventorySortIndicator(key: InventorySort): string {
    return this.inventorySort() === key ? this.inventoryDirection() === 1 ? '↑' : '↓' : '';
  }

  setMobileInventorySort(value: string): void {
    const [key, direction] = value.split(':');
    this.inventorySort.set(key as InventorySort);
    this.inventoryDirection.set(direction === 'desc' ? -1 : 1);
  }

  async openStockDetail(item: StockRow): Promise<void> {
    this.stockDetailError.set('');
    try {
      this.stockDetail.set(await this.api.get<StockDetail>(
        `/api/inventory/${encodeURIComponent(item.categoryCode)}/${item.lengthCm}`));
    } catch (error) { this.stockDetailError.set(this.errorMessage(error)); }
  }

  movementLabel(kind: string): string { return kind === 'PURCHASE' ? 'Compra' : 'Venta'; }

  ngOnInit(): void {
    void this.restore();
  }

  private async restore(): Promise<void> {
    try {
      const account = await this.session.restore();
      if (account && !account.mustChangePassword) { this.section.set(account.role === 'ADMIN' ? 'dashboard' : 'inventory'); await this.loadData(); }
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async login(): Promise<void> {
    if (this.busy()) return;
    if (!this.username.trim() || !this.password) {
      this.error.set('Ingresa tu usuario y contraseña.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const account = await this.session.login(this.username.trim(), this.password);
      if (!account.mustChangePassword) { this.section.set(account.role === 'ADMIN' ? 'dashboard' : 'inventory'); await this.loadData(); }
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.password = '';
      this.busy.set(false);
    }
  }

  async changePassword(): Promise<void> {
    if (this.busy()) return;
    if (this.newPassword.length < 8) {
      this.error.set('La nueva contraseña debe tener al menos ocho caracteres.');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error.set('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.session.changePassword(this.currentPassword, this.newPassword);
      await this.loadData();
      this.section.set(this.session.account()?.role === 'ADMIN' ? 'dashboard' : 'inventory');
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  async logout(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.session.logout();
      this.categories.set([]);
      this.lengths.set([]);
      this.stock.set([]);
      this.dataLoaded.set(false);
      this.section.set('inventory');
      this.message.set('');
      this.username = '';
      this.mobileOpen.set(false);
      this.profileOpen.set(false);
      this.backupDue.set(false);
      this.backupDismissed.set(false);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  async refresh(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await this.loadData();
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  async addCategory(): Promise<void> {
    const name = this.categoryDraft.trim();
    if (!name || this.busy()) return;
    await this.changeCatalog(() => this.api.write<Category>('POST', '/api/catalog/categories', { displayName: name }),
      'Categoría agregada.');
    if (!this.error()) this.categoryDraft = '';
  }

  async addLength(): Promise<void> {
    const centimeters = this.lengthDraft;
    if (!Number.isInteger(centimeters) || !centimeters || centimeters <= 0 || this.busy()) {
      this.error.set('Indica una longitud entera y positiva en centímetros.');
      return;
    }
    await this.changeCatalog(() => this.api.write<Length>('POST', '/api/catalog/lengths', { centimeters }),
      'Longitud agregada.');
    if (!this.error()) this.lengthDraft = null;
  }

  async removeCategory(category: Category): Promise<void> {
    if (this.busy() || !confirm(`¿Quitar la categoría «${category.displayName}»?`)) return;
    await this.changeCatalog(() => this.api.write<void>('DELETE',
      `/api/catalog/categories/${encodeURIComponent(category.code)}`), 'Categoría quitada.');
  }

  async removeLength(length: Length): Promise<void> {
    if (this.busy() || !confirm(`¿Quitar la longitud de ${length.centimeters} cm?`)) return;
    await this.changeCatalog(() => this.api.write<void>('DELETE',
      `/api/catalog/lengths/${length.centimeters}`), 'Longitud quitada.');
  }

  private async changeCatalog(change: () => Promise<unknown>, success: string): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await change();
      await this.loadData();
      this.message.set(success);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async loadData(): Promise<void> {
    try {
      const [categories, lengths, stock, backup] = await Promise.all([
        this.api.get<Category[]>('/api/catalog/categories'),
        this.api.get<Length[]>('/api/catalog/lengths'),
        this.api.get<StockRow[]>('/api/inventory'),
        this.session.account()?.role === 'ADMIN' ? this.api.get<BackupSettings>('/api/backups/settings') : Promise.resolve(null),
      ]);
      this.categories.set(categories);
      this.lengths.set(lengths);
      this.stock.set(stock);
      this.backupDue.set(backup?.due ?? false);
      this.dataLoaded.set(true);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        await this.session.restore();
        this.dataLoaded.set(false);
      }
      throw error;
    }
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'No se pudo completar la solicitud. Inténtalo nuevamente.';
    if (error.status === 0) return 'No se pudo conectar con la API. Comprueba que Spring Boot esté funcionando.';
    if (error.status === 401) {
      void this.session.restore().catch(() => undefined);
      return 'Usuario o contraseña incorrectos, o la sesión ha vencido.';
    }
    if (error.status === 429) return 'Hubo varios intentos fallidos. Espera unos minutos antes de volver a ingresar.';
    if (error.status === 403) return 'La operación fue rechazada. Recarga la página e inténtalo nuevamente.';
    const message = error.error?.error;
    return typeof message === 'string' ? message : 'El servidor no pudo completar la solicitud.';
  }
}
