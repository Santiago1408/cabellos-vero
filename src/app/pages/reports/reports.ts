import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DemoStore, Sale, categoryLabel, dateLabel, debtBalance, money, operationValue, productName, weight } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

@Component({ selector: 'app-reports', standalone: true, imports: [RouterLink, Icon], templateUrl: './reports.html',
  styleUrl: './reports.css' })
export class Reports {
  readonly store = inject(DemoStore);
  readonly money = money;
  readonly weight = weight;
  readonly dateLabel = dateLabel;
  readonly categoryLabel = categoryLabel;
  readonly productName = productName;
  readonly storeSaleValue = (sale: Sale) => operationValue(sale.items);
  readonly months = this.store.monthlySummaries;
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
  readonly confirmedSales = computed(() => [...this.store.confirmedSales()].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)));
  readonly selectedSaleId = signal<string | null>(null);
  readonly selectedSale = computed(() => this.store.confirmedSales().find(sale => sale.id === this.selectedSaleId()));
  readonly allocations = computed(() => this.store.fifo().allocations.filter(item => item.saleId === this.selectedSaleId()));
  allocationName(productId: string) {
    const product = this.store.products().find(item => item.id === productId);
    return product ? productName(product.category, product.length) : 'Cabello';
  }
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
