import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DemoStore, categoryLabel, debtBalance, money, operationValue, productName, todayLocal, weight } from '../../data/demo-store';
import { ReportPeriod, summarizePeriods } from '../../data/report-periods';
import { Icon } from '../../shared/icon/icon';

@Component({ selector: 'app-reports', standalone: true, imports: [FormsModule, RouterLink, Icon], templateUrl: './reports.html',
  styleUrl: './reports.css' })
export class Reports {
  readonly store = inject(DemoStore);
  readonly money = money;
  readonly weight = weight;
  readonly categoryLabel = categoryLabel;
  readonly productName = productName;
  readonly months = this.store.monthlySummaries;
  readonly period = signal<ReportPeriod>('months');
  readonly today = todayLocal();
  readonly periodRows = computed(() => summarizePeriods(this.period(), this.today, this.store.orders(), this.store.sales(), this.store.fifo().allocations));
  readonly periodHeading = computed(() => ({ days: 'Resultados diarios', weeks: 'Resultados semanales', months: 'Resultados mensuales' })[this.period()]);
  readonly periodColumn = computed(() => ({ days: 'Día', weeks: 'Semana', months: 'Mes' })[this.period()]);
  setPeriod(value: ReportPeriod) { this.period.set(value); }
  readonly revenue = computed(() => this.store.confirmedSales().reduce((sum, sale) => sum + operationValue(sale.items), 0));
  readonly costs = computed(() => this.store.fifo().allocations.reduce((sum, item) => sum + item.quantity * item.unitCost, 0));
  readonly profit = computed(() => this.revenue() - this.costs());
  readonly stockValue = computed(() => this.store.fifo().remainingValue);
  readonly receivable = computed(() => this.store.debts().filter(debt => debt.kind === 'Por cobrar').reduce((sum, debt) => sum + debtBalance(debt), 0));
  readonly payable = computed(() => this.store.debts().filter(debt => debt.kind === 'Por pagar').reduce((sum, debt) => sum + debtBalance(debt), 0));
  readonly topProducts = computed(() => this.store.products().map(product => ({
    ...product, soldWeight: this.store.productSold(product.id), revenue: this.store.productRevenue(product.id),
  })).filter(product => product.soldWeight > 0).sort((a, b) => b.soldWeight - a.soldWeight).slice(0, 5));
  readonly topCategories = computed(() => {
    const totals = new Map<string, number>();
    for (const sale of this.store.confirmedSales()) for (const item of sale.items)
      totals.set(item.category, (totals.get(item.category) ?? 0) + item.quantity);
    const all = [...totals.values()].reduce((sum, quantity) => sum + quantity, 0);
    return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, sold]) => ({ name, sold, percent: all ? Math.round(sold / all * 100) : 0 }));
  });
  readonly chartBounds = computed(() => {
    const values = this.months().flatMap(month => [month.purchases, month.sales, month.profit]);
    const maximum = Math.max(0, ...values);
    const minimum = Math.min(0, ...values);
    return { maximum, minimum, span: Math.max(1, maximum - minimum) };
  });
  readonly axisLabels = computed(() => Array.from({ length: 5 }, (_, index) =>
    new Intl.NumberFormat('es-BO', { notation: 'compact', maximumFractionDigits: 1 })
      .format(this.chartBounds().maximum - this.chartBounds().span * index / 4)));
  readonly salesPoints = computed(() => this.chartPoints(this.months().map(month => month.sales)));
  readonly purchasePoints = computed(() => this.chartPoints(this.months().map(month => month.purchases)));
  readonly profitPoints = computed(() => this.chartPoints(this.months().map(month => month.profit)));
  private chartPoints(values: number[]) {
    const { minimum, span } = this.chartBounds();
    return values.map((value, index) => `${index * (1000 / (values.length - 1))},${240 - ((value - minimum) / span) * 240}`).join(' ');
  }
}
