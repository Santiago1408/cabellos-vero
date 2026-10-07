import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DemoStore, dateLabel, debtBalance, money, operationEffectiveDate, operationValue, todayLocal, weight } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

@Component({ selector: 'app-dashboard', standalone: true, imports: [RouterLink, Icon], templateUrl: './dashboard.html', styleUrl: './dashboard.css' })
export class Dashboard {
  readonly store = inject(DemoStore);
  readonly money = money;
  readonly weight = weight;
  readonly dateLabel = dateLabel;
  readonly operationValue = operationValue;
  readonly currentMonth = todayLocal().slice(0, 7);
  readonly todayLabel = new Intl.DateTimeFormat('es-BO', { dateStyle: 'long' }).format(new Date());
  readonly monthSales = computed(() => this.store.confirmedSales().filter(sale => operationEffectiveDate(sale).startsWith(this.currentMonth)));
  readonly revenue = computed(() => this.monthSales().reduce((sum, sale) => sum + operationValue(sale.items), 0));
  readonly costs = computed(() => this.monthSales().reduce((sum, sale) => sum + this.store.saleCost(sale.id), 0));
  readonly profit = computed(() => this.revenue() - this.costs());
  readonly purchaseValue = computed(() => this.store.orders().filter(order => order.status === 'Confirmado' && operationEffectiveDate(order).startsWith(this.currentMonth))
    .reduce((sum, order) => sum + operationValue(order.items), 0));
  readonly stockWeight = computed(() => this.store.products().reduce((sum, product) => sum + product.quantity, 0));
  readonly lowProducts = computed(() => this.store.managedProducts().filter(product => product.threshold > 0
    && this.store.sellableWeight(product.id) <= product.threshold).slice(0, 3));
  readonly pendingOrders = computed(() => this.store.orders().filter(order => order.status === 'Pendiente').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3));
  readonly pendingSales = computed(() => this.store.sales().filter(sale => sale.status === 'Pendiente').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3));
  readonly pendingOrdersCount = computed(() => this.store.orders().filter(order => order.status === 'Pendiente').length);
  readonly pendingSalesCount = computed(() => this.store.sales().filter(sale => sale.status === 'Pendiente').length);
  readonly receivable = computed(() => this.store.debts().filter(debt => debt.kind === 'Por cobrar').reduce((sum, debt) => sum + debtBalance(debt), 0));
  readonly payable = computed(() => this.store.debts().filter(debt => debt.kind === 'Por pagar').reduce((sum, debt) => sum + debtBalance(debt), 0));
  readonly months = this.store.monthlySummaries;
  readonly chartMaximum = computed(() => Math.max(1, ...this.months().flatMap(month => [month.purchases, month.sales])));
  readonly chartLabels = computed(() => Array.from({ length: 5 }, (_, index) =>
    new Intl.NumberFormat('es-BO', { notation: 'compact', maximumFractionDigits: 1 }).format(this.chartMaximum() * (4 - index) / 4)));
  readonly topProducts = computed(() => this.store.products().map(product => ({
    ...product, soldWeight: this.store.productSold(product.id), revenue: this.store.productRevenue(product.id),
  })).filter(product => product.soldWeight > 0).sort((a, b) => b.soldWeight - a.soldWeight).slice(0, 3));
  get firstName() { return this.store.displayName().split(' ')[0]; }
}
