import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DemoStore, money, stockStatus } from '../data/demo-store';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-dashboard', standalone: true, imports: [RouterLink, Icon],
  template: `<div class="page-header"><div><div class="eyebrow">RESUMEN GENERAL</div><h1>Hola, {{ firstName }} <span class="greeting-wave">✳</span></h1><p>Esto es lo que ocurre hoy en Cabellos Vero.</p></div><div class="header-date">Septiembre 2026</div></div>
    <div class="dashboard-grid grid gap-[18px]">
      <section class="card dash-panel sales-panel"><div class="card-heading"><h2>Resumen de ventas</h2><span class="period-pill">Últimos 30 días</span></div><div class="metric-row four">
        <div class="metric"><span class="metric-icon"><app-icon name="truck"/></span><strong>84</strong><small>Ventas</small></div>
        <div class="metric"><span class="metric-icon"><app-icon name="chart"/></span><strong>{{ money(18300) }}</strong><small>Ingresos</small></div>
        <div class="metric"><span class="metric-icon"><app-icon name="arrow"/></span><strong>{{ money(6868) }}</strong><small>Ganancia</small></div>
        <div class="metric"><span class="metric-icon"><app-icon name="package"/></span><strong>{{ money(11432) }}</strong><small>Costos</small></div>
      </div></section>
      <section class="card dash-panel inventory-panel"><div class="card-heading"><h2>Resumen de inventario</h2></div><div class="metric-row two"><div class="metric"><span class="metric-icon"><app-icon name="box"/></span><strong>{{ stockCount() }}</strong><small>Unidades disponibles</small></div><div class="metric"><span class="metric-icon"><app-icon name="alert"/></span><strong>{{ lowCount() }}</strong><small>Productos por reponer</small></div></div></section>
      <section class="card dash-panel purchase-panel"><div class="card-heading"><h2>Resumen de compras</h2><span class="period-pill">Últimos 30 días</span></div><div class="metric-row four"><div class="metric"><span class="metric-icon"><app-icon name="truck"/></span><strong>{{ store.orders().length }}</strong><small>Pedidos</small></div><div class="metric"><span class="metric-icon"><app-icon name="package"/></span><strong>{{ money(orderValue()) }}</strong><small>Valor total</small></div><div class="metric"><span class="metric-icon"><app-icon name="check"/></span><strong>{{ receivedCount() }}</strong><small>Recibidos</small></div><div class="metric"><span class="metric-icon"><app-icon name="users"/></span><strong>{{ store.suppliers().length }}</strong><small>Proveedores</small></div></div></section>
      <section class="card dash-panel product-panel"><div class="card-heading"><h2>Resumen de productos</h2></div><div class="metric-row two"><div class="metric"><span class="metric-icon"><app-icon name="box"/></span><strong>{{ store.products().length }}</strong><small>Productos registrados</small></div><div class="metric"><span class="metric-icon"><app-icon name="chart"/></span><strong>{{ categoryCount() }}</strong><small>Categorías</small></div></div></section>
      <section class="card chart-card"><div class="card-heading"><h2>Ventas y compras</h2><span class="period-pill">Mensual</span></div><div class="bar-chart"><div class="chart-gridlines"><span>20 mil</span><span>15 mil</span><span>10 mil</span><span>5 mil</span><span>0</span></div><div class="bar-columns">@for (month of months; track month.label) { <div class="bar-group"><div class="bar-pair"><span class="bar purchases" [style.height.%]="month.purchases"></span><span class="bar sales" [style.height.%]="month.sales"></span></div><small>{{ month.label }}</small></div> }</div></div><div class="chart-legend"><span><i class="legend-swatch black"></i> Compras</span><span><i class="legend-swatch gray"></i> Ventas</span></div></section>
      <section class="card order-chart-card"><div class="card-heading"><h2>Estado de pedidos</h2><a routerLink="/pedidos" class="text-link">Ver todos <app-icon name="arrow"/></a></div><div class="donut-wrap"><div class="donut"><div><strong>{{ store.orders().length }}</strong><small>Pedidos</small></div></div></div><div class="order-legend"><span><i class="legend-swatch black"></i> Activos <strong>{{ activeCount() }}</strong></span><span><i class="legend-swatch gray"></i> Finalizados <strong>{{ store.orders().length - activeCount() }}</strong></span></div></section>
      <section class="card table-card top-products"><div class="card-heading"><h2>Productos más vendidos</h2><a routerLink="/inventario" class="text-link">Ver todos <app-icon name="arrow"/></a></div><div class="table-scroll"><table><thead><tr><th>Producto</th><th>Unidades vendidas</th><th>En stock</th><th>Precio</th></tr></thead><tbody>@for (p of topProducts(); track p.id) { <tr><td><a [routerLink]="['/inventario', p.id]" class="table-primary">{{ p.name }}</a></td><td>{{ p.sold }}</td><td>{{ p.quantity }}</td><td>{{ money(p.price) }}</td></tr> }</tbody></table></div></section>
      <section class="card low-stock-card"><div class="card-heading"><h2>Stock bajo</h2><a routerLink="/inventario" class="text-link">Ver todos <app-icon name="arrow"/></a></div><div class="low-stock-list">@for (p of lowProducts(); track p.id) { <a [routerLink]="['/inventario', p.id]" class="low-stock-item"><span class="product-initial">{{ p.name[0] }}</span><span><strong>{{ p.name }}</strong><small>{{ p.quantity }} {{ p.unit }} disponibles</small></span><span class="badge" [class.badge-danger]="p.quantity === 0">{{ stockStatus(p) }}</span></a> }</div></section>
    </div>`
})
export class Dashboard {
  readonly store = inject(DemoStore);
  readonly money = money;
  readonly stockStatus = stockStatus;
  readonly stockCount = computed(() => this.store.products().reduce((sum, p) => sum + p.quantity, 0));
  readonly lowCount = computed(() => this.store.products().filter(p => p.quantity <= p.threshold).length);
  readonly categoryCount = computed(() => new Set(this.store.products().map(p => p.category)).size);
  readonly orderValue = computed(() => this.store.orders().reduce((sum, o) => sum + o.value, 0));
  readonly receivedCount = computed(() => this.store.orders().filter(o => o.status === 'Recibido').length);
  readonly activeCount = computed(() => this.store.orders().filter(o => !['Recibido', 'Devuelto'].includes(o.status)).length);
  readonly topProducts = computed(() => [...this.store.products()].sort((a,b) => b.sold - a.sold).slice(0,3));
  readonly lowProducts = computed(() => this.store.products().filter(p => p.quantity <= p.threshold).slice(0,3));
  readonly months = [{label:'Abr',purchases:65,sales:57},{label:'May',purchases:78,sales:70},{label:'Jun',purchases:58,sales:74},{label:'Jul',purchases:72,sales:62},{label:'Ago',purchases:84,sales:79},{label:'Sep',purchases:74,sales:90}];
  get firstName() { return this.store.displayName().split(' ')[0]; }
}
