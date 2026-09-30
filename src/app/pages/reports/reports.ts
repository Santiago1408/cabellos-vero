import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DemoStore, categoryLabel, debtBalance, money, monthlySummaries, operationValue, saleCost, weight } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

@Component({selector:'app-reports',standalone:true,imports:[RouterLink,Icon],templateUrl: './reports.html',
  styleUrl: './reports.css'})
export class Reports {
  readonly store=inject(DemoStore);readonly money=money;readonly weight=weight;readonly categoryLabel=categoryLabel;readonly months=monthlySummaries;
  readonly revenue=computed(()=>this.store.sales().filter(s=>s.status==='Confirmado').reduce((sum,s)=>sum+operationValue(s.items),0));
  readonly costs=computed(()=>this.store.sales().filter(s=>s.status==='Confirmado').reduce((sum,s)=>sum+saleCost(s.items),0));
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
