import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../data/api-client';
import { PeriodReport, ReportOverview, ReportPeriod, TopCategory, TopProduct } from '../../data/report-api';

@Component({
  selector: 'app-connected-reports',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './connected-reports.html',
  styleUrls: ['./connected-reports.css', '../reports/reports.css'],
})
export class ConnectedReports implements OnInit {
  private readonly api = inject(ApiClient);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly overview = signal<ReportOverview | null>(null);
  readonly results = signal<PeriodReport | null>(null);
  readonly products = signal<TopProduct[]>([]);
  readonly categories = signal<TopCategory[]>([]);
  readonly period = signal<ReportPeriod>('months');
  readonly chartRows = computed(() => (this.results()?.rows ?? []).slice(-6));
  readonly maximum = computed(() => Math.max(1, ...this.chartRows().flatMap(row => [row.purchases, row.sales])));

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [overview, results, products, categories] = await Promise.all([
        this.api.get<ReportOverview>('/api/reports/overview'),
        this.api.get<PeriodReport>(`/api/reports/results?period=${this.period()}`),
        this.api.get<TopProduct[]>('/api/reports/top-products?limit=5'),
        this.api.get<TopCategory[]>('/api/reports/top-categories?limit=5'),
      ]);
      this.overview.set(overview);
      this.results.set(results);
      this.products.set(products);
      this.categories.set(categories);
    } catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.loading.set(false); }
  }

  async setPeriod(value: ReportPeriod): Promise<void> {
    this.error.set('');
    try { const results = await this.api.get<PeriodReport>(`/api/reports/results?period=${value}`); this.period.set(value); this.results.set(results); }
    catch (error) { this.error.set(this.errorMessage(error)); }
  }

  periodHeading(): string { return { days: 'Resultados diarios', weeks: 'Resultados semanales', months: 'Resultados mensuales' }[this.period()]; }
  label(date: string): string {
    const [year, month, day] = date.split('-').map(Number);
    if (this.period() === 'months') return new Intl.DateTimeFormat('es-BO', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
    if (this.period() === 'weeks') return `Semana del ${day}/${month}/${year}`;
    return `${day}/${month}/${year}`;
  }
  chartHeight(value: number): number { return Math.max(0, Math.abs(value) / this.maximum() * 100); }
  money(value: number): string { return `${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} Bs.`; }
  weight(value: number): string { return `${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} g`; }
  private errorMessage(error: unknown): string {
    return error instanceof HttpErrorResponse && typeof error.error?.error === 'string'
      ? error.error.error : 'No se pudieron cargar los reportes. Inténtalo nuevamente.';
  }
}
