import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, output, signal } from '@angular/core';
import { ApiClient } from '../../data/api-client';
import { AuthSession } from '../../data/auth-session';
import { DebtSummary } from '../../data/debt-api';
import { PurchaseSummary } from '../../data/purchase-api';
import { PeriodReport, TopProduct } from '../../data/report-api';
import { SaleSummary } from '../../data/sale-api';
import { Icon } from '../../shared/icon/icon';

type StockRow = { physicalStock: number };

@Component({
  selector: 'app-connected-dashboard', standalone: true,
  imports: [Icon],
  templateUrl: './connected-dashboard.html',
  styleUrls: ['./connected-dashboard.css', '../dashboard/dashboard.css'],
})
export class ConnectedDashboard implements OnInit {
  private readonly api = inject(ApiClient);
  readonly session = inject(AuthSession);
  readonly navigate = output<'reports' | 'inventory' | 'purchases' | 'sales' | 'debts'>();
  readonly loading = signal(true);
  readonly error = signal('');
  readonly report = signal<PeriodReport | null>(null);
  readonly products = signal<TopProduct[]>([]);
  readonly purchases = signal<PurchaseSummary[]>([]);
  readonly sales = signal<SaleSummary[]>([]);
  readonly debts = signal<DebtSummary[]>([]);
  readonly stock = signal<StockRow[]>([]);
  readonly current = computed(() => this.report()?.rows.at(-1));
  readonly maximum = computed(() => Math.max(1, ...(this.report()?.rows.flatMap(row => [row.purchases, row.sales]) ?? [])));
  readonly pendingPurchaseCount = computed(() => this.purchases().filter(row => row.status === 'PENDING').length);
  readonly pendingSaleCount = computed(() => this.sales().filter(row => row.status === 'PENDING').length);
  readonly pendingPurchases = computed(() => this.purchases().filter(row => row.status === 'PENDING').slice(0, 4));
  readonly pendingSales = computed(() => this.sales().filter(row => row.status === 'PENDING').slice(0, 4));
  readonly stockWeight = computed(() => this.stock().reduce((total, row) => total + row.physicalStock, 0));
  readonly receivable = computed(() => this.debts().filter(row => row.kind === 'RECEIVABLE').reduce((total, row) => total + row.balance, 0));
  readonly payable = computed(() => this.debts().filter(row => row.kind === 'PAYABLE').reduce((total, row) => total + row.balance, 0));

  ngOnInit(): void { void this.load(); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const [report, products, purchases, sales, debts, stock] = await Promise.all([
        this.api.get<PeriodReport>('/api/reports/results?period=months&count=6'),
        this.api.get<TopProduct[]>('/api/reports/top-products?limit=5'),
        this.api.get<PurchaseSummary[]>('/api/purchases'),
        this.api.get<SaleSummary[]>('/api/sales'),
        this.api.get<DebtSummary[]>('/api/debts'),
        this.api.get<StockRow[]>('/api/inventory'),
      ]);
      this.report.set(report); this.products.set(products); this.purchases.set(purchases);
      this.sales.set(sales); this.debts.set(debts); this.stock.set(stock);
    } catch (error) { this.error.set(error instanceof HttpErrorResponse && typeof error.error?.error === 'string' ? error.error.error : 'No se pudo cargar Inicio.'); }
    finally { this.loading.set(false); }
  }
  money(value: number): string { return `${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} Bs.`; }
  weight(value: number): string { return `${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} g`; }
  month(value: string): string {
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('es-BO', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
  }
  height(value: number): number { return value / this.maximum() * 100; }
}
