import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DemoStore, categoryLabel, debtBalance, money, monthlySummaries, weight } from '../data/demo-store';
import { Icon } from '../shared/icon';

@Component({selector:'app-reports',standalone:true,imports:[RouterLink,Icon],template:`
  <div class="page-header"><div><div class="eyebrow">ANÁLISIS</div><h1>Reportes</h1><p>Una vista clara del movimiento de compra y venta de cabello.</p></div><span class="period-pill page-period">Últimos 6 meses</span></div>
  <div class="reports-grid"><section class="card report-overview"><div class="card-heading"><h2>Resumen financiero</h2></div><div class="report-primary-metrics"><div><strong>{{money(profit())}}</strong><span>Ganancia de ventas demo</span></div><div><strong>{{money(revenue())}}</strong><span>Ingresos</span></div><div><strong>{{money(costs())}}</strong><span>Costos</span></div></div><div class="report-secondary-metrics"><div><strong>{{money(stockValue())}}</strong><span>Inventario a costo</span></div><div><strong>{{money(receivable())}}</strong><span>Saldo por cobrar</span></div><div><strong>{{money(payable())}}</strong><span>Saldo por pagar</span></div><div><strong>{{store.products().length}}</strong><span>Productos</span></div></div></section>
  <section class="card category-card"><div class="card-heading"><h2>Categorías destacadas</h2><a routerLink="/inventario" class="text-link">Ver inventario <app-icon name="arrow"/></a></div><div class="table-scroll"><table><thead><tr><th>Categoría</th><th>Peso vendido</th><th>Participación</th></tr></thead><tbody>@for(c of topCategories();track c.name){<tr><td>{{categoryLabel(c.name)}}</td><td>{{weight(c.sold)}}</td><td>{{c.percent}}%</td></tr>}</tbody></table></div></section>
  <section class="card revenue-chart-card"><div class="card-heading"><h2>Ingresos y ganancias</h2><span class="period-pill">Mensual</span></div><div class="line-chart"><div class="line-y-axis"><span>45 mil</span><span>34 mil</span><span>23 mil</span><span>11 mil</span><span>0</span></div><div class="line-plot"><div class="line-grid"><span></span><span></span><span></span><span></span><span></span></div><svg viewBox="0 0 1000 240" preserveAspectRatio="none" aria-label="Gráfico de ingresos y ganancias"><polyline [attr.points]="salesPoints" fill="none" stroke="var(--color-primary)" stroke-width="4" vector-effect="non-scaling-stroke"/><polyline [attr.points]="profitPoints" fill="none" stroke="var(--color-chart-secondary)" stroke-width="4" vector-effect="non-scaling-stroke"/></svg><div class="line-x-axis">@for(month of months;track month.label){<span>{{month.label}}</span>}</div></div></div><div class="chart-legend"><span><i class="legend-swatch black"></i> Ingresos</span><span><i class="legend-swatch gray"></i> Ganancias</span></div></section>
  <section class="card table-card best-products"><div class="card-heading"><h2>Cabellos más vendidos</h2><a routerLink="/inventario" class="text-link">Ver todos <app-icon name="arrow"/></a></div><div class="table-scroll"><table><thead><tr><th>Producto</th><th>Código</th><th>Categoría</th><th>Disponible</th><th>Peso vendido</th><th>Valor de ventas</th></tr></thead><tbody>@for(p of topProducts();track p.id){<tr><td><a class="table-primary" [routerLink]="['/inventario',p.id]">{{p.name}}</a></td><td>{{p.id}}</td><td>{{categoryLabel(p.category)}}</td><td>{{weight(p.quantity)}}</td><td>{{weight(p.sold)}}</td><td>{{money(p.sold*p.salePrice)}}</td></tr>}</tbody></table></div></section></div>
`})
export class Reports {
  readonly store=inject(DemoStore);readonly money=money;readonly weight=weight;readonly categoryLabel=categoryLabel;readonly months=monthlySummaries;
  readonly revenue=computed(()=>this.store.sales().reduce((sum,s)=>sum+s.value,0));
  readonly costs=computed(()=>this.store.sales().reduce((sum,s)=>sum+s.cost,0));
  readonly profit=computed(()=>this.revenue()-this.costs());
  readonly stockValue=computed(()=>this.store.products().reduce((n,p)=>n+p.quantity*p.purchasePrice,0));
  readonly receivable=computed(()=>this.store.debts().filter(d=>d.kind==='Por cobrar').reduce((sum,d)=>sum+debtBalance(d),0));
  readonly payable=computed(()=>this.store.debts().filter(d=>d.kind==='Por pagar').reduce((sum,d)=>sum+debtBalance(d),0));
  readonly topProducts=computed(()=>[...this.store.products()].sort((a,b)=>b.sold-a.sold).slice(0,5));
  readonly topCategories=computed(()=>this.categoryGroups());
  readonly salesPoints=this.chartPoints(monthlySummaries.map(m=>m.sales));
  readonly profitPoints=this.chartPoints(monthlySummaries.map(m=>m.profit));
  private categoryGroups(){
    const groups=new Map<string,number>();
    for(const p of this.store.products()) groups.set(p.category,(groups.get(p.category)||0)+p.sold);
    const total=[...groups.values()].reduce((a,b)=>a+b,0);
    return [...groups].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,sold])=>({name:name as Parameters<typeof categoryLabel>[0],sold,percent:Math.round(sold/total*100)}));
  }
  private chartPoints(values:number[]){return values.map((value,index)=>`${index*(1000/(values.length-1))},${220-(value/45000)*190}`).join(' ');}
}
