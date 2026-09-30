import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DemoStore, debtBalance, debtStatus, money, monthlySummaries, operationValue, saleCost, weight } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

@Component({
  selector: 'app-dashboard', standalone: true, imports: [RouterLink, Icon],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard {
  readonly store = inject(DemoStore);
  readonly money = money; readonly weight = weight;
  readonly revenue = computed(() => this.store.sales().filter(sale => sale.status === 'Confirmado').reduce((sum, sale) => sum + operationValue(sale.items), 0));
  readonly costs = computed(() => this.store.sales().filter(sale => sale.status === 'Confirmado').reduce((sum, sale) => sum + saleCost(sale.items), 0));
  readonly profit = computed(() => this.revenue() - this.costs());
  readonly stockWeight = computed(() => this.store.products().reduce((sum, p) => sum + this.store.sellableWeight(p.id), 0));
  readonly lowCount = computed(() => this.store.products().filter(p => this.store.sellableWeight(p.id) <= p.threshold).length);
  readonly categoryCount = computed(() => new Set(this.store.products().map(p => p.category)).size);
  readonly orderValue = computed(() => this.store.orders().reduce((sum, o) => sum + operationValue(o.items), 0));
  readonly receivedCount = computed(() => this.store.orders().filter(o => o.status === 'Confirmado').length);
  readonly activeCount = computed(() => this.store.orders().filter(o => o.status === 'Pendiente').length);
  readonly topProducts = computed(() => [...this.store.products()].sort((a,b) => b.sold - a.sold).slice(0,3));
  readonly lowProducts = computed(() => this.store.products().filter(p => this.store.sellableWeight(p.id) <= p.threshold).slice(0,3));
  readonly receivable = computed(() => this.store.debts().filter(d => d.kind === 'Por cobrar').reduce((sum,d) => sum + debtBalance(d), 0));
  readonly payable = computed(() => this.store.debts().filter(d => d.kind === 'Por pagar').reduce((sum,d) => sum + debtBalance(d), 0));
  readonly overdueCount = computed(() => this.store.debts().filter(d => debtStatus(d) === 'Vencida').length);
  readonly paidDebtCount = computed(() => this.store.debts().filter(d => debtStatus(d) === 'Pagada').length);
  readonly months = monthlySummaries.map(month => ({label: month.label, purchases: month.purchases / 450, sales: month.sales / 450}));
  get firstName() { return this.store.displayName().split(' ')[0]; }
}
