import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoStore, Order, dateLabel, downloadCsv, money, weight } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

const blankOrder=():Order=>({id:'',product:'',supplier:'',quantity:100,unit:'g',value:0,delivery:'',status:'Pendiente'});
@Component({selector:'app-orders',standalone:true,imports:[FormsModule,Icon],templateUrl: './orders.html',
  styleUrl: './orders.css'})
export class Orders {
  readonly store=inject(DemoStore);readonly money=money;readonly weight=weight;readonly dateLabel=dateLabel;readonly page=signal(1);readonly modalOpen=signal(false);readonly error=signal('');readonly statusFilter=signal('');draft=blankOrder();notify=true;
  readonly filtered=computed(()=>this.store.orders().filter(o=>`${o.product} ${o.id} ${o.supplier}`.toLowerCase().includes(this.store.query().toLowerCase())&&(!this.statusFilter()||o.status===this.statusFilter())));
  readonly pageCount=computed(()=>Math.max(1,Math.ceil(this.filtered().length/7)));
  readonly pageItems=computed(()=>this.filtered().slice((Math.min(this.page(),this.pageCount())-1)*7,Math.min(this.page(),this.pageCount())*7));
  count(status:Order['status']){return this.store.orders().filter(o=>o.status===status).length;}
  open(){this.draft=blankOrder();this.error.set('');this.modalOpen.set(true);}
  selectProduct(){const p=this.store.products().find(p=>p.name===this.draft.product);if(p){this.draft.supplier=p.supplier;this.draft.unit=p.unit;this.updateValue();}}
  updateValue(){const p=this.store.products().find(p=>p.name===this.draft.product);if(p)this.draft.value=p.purchasePrice*this.draft.quantity;}
  save(){if(!this.draft.product||!this.draft.supplier||!this.draft.delivery||this.draft.quantity<1){this.error.set('Completa cabello, proveedor, peso y fecha de entrega.');return;}this.store.addOrder({...this.draft,id:`COMP-${1047+this.store.orders().length-6}`});this.page.set(1);this.modalOpen.set(false);}
  export(){downloadCsv('compras-cabellos-vero.csv',['N.º','Cabello','Proveedor','Peso g','Valor Bs.','Entrega','Estado'],this.filtered().map(o=>[o.id,o.product,o.supplier,o.quantity,o.value,o.delivery,o.status]));}
}
