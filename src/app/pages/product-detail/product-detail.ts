import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DemoStore, Product, categoryLabel, dateLabel, downloadCsv, hairCategories, hairLengths, money, productName, weight } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

@Component({ selector:'app-product-detail', standalone:true, imports:[RouterLink,FormsModule,Icon], templateUrl: './product-detail.html',
  styleUrl: './product-detail.css' })
export class ProductDetail {
  readonly store=inject(DemoStore); private readonly route=inject(ActivatedRoute);
  readonly money=money; readonly weight=weight; readonly dateLabel=dateLabel; readonly categoryLabel=categoryLabel;
  readonly categories=hairCategories; readonly lengths=hairLengths;
  readonly tab=signal<'general'|'compras'|'ventas'|'ajustes'|'historial'>('general'); readonly editing=signal(false); readonly error=signal('');
  readonly params=toSignal(this.route.paramMap,{initialValue:this.route.snapshot.paramMap});
  readonly product=computed(()=>this.store.products().find(p=>p.id===this.params().get('id')));
  readonly relatedOrders=computed(()=>this.store.orders().flatMap(order=>order.items.filter(item=>item.productId===this.product()?.id).map(item=>({order,item}))));
  readonly relatedSales=computed(()=>this.store.sales().flatMap(sale=>sale.items.filter(item=>item.productId===this.product()?.id).map(item=>({sale,item}))));
  newQuantity=0; draft:Product={id:'',name:'',category:'normal',length:38,purchasePrice:0,salePrice:0,quantity:0,threshold:0,unit:'g',color:'',quality:'',supplier:'',sold:0};
  get editName(){return productName(this.draft.category,this.draft.length);}
  supplierPhone(name:string){return this.store.suppliers().find(s=>s.name===name)?.phone || '—';}
  openEdit(p:Product){this.draft={...p};this.newQuantity=p.quantity;this.error.set('');this.editing.set(true);}
  saveEdit(){
    if(!this.draft.color.trim()||!this.draft.quality.trim()){this.error.set('Completa el color y la calidad.');return;}
    if(this.draft.salePrice<this.draft.purchasePrice){this.error.set('El precio de venta no puede ser menor al precio de compra.');return;}
    if(this.store.products().some(p=>p.id!==this.draft.id&&p.category===this.draft.category&&p.length===this.draft.length)){this.error.set('Ya existe otro producto con esa categoría y longitud.');return;}
    this.store.updateProduct({...this.draft,name:this.editName});this.editing.set(false);
  }
  adjust(p:Product){
    if(!Number.isFinite(this.newQuantity)||this.newQuantity<0){this.error.set('Ingresa un peso válido.');return;}
    if(this.newQuantity+this.store.pendingPurchaseWeight(p.id)<this.store.pendingSaleWeight(p.id)){
      this.error.set('El ajuste dejaría sin respaldo a ventas reservadas.');return;
    }
    this.store.updateProduct({...p,quantity:this.newQuantity});this.error.set('');
  }
  download(p:Product){downloadCsv(`producto-${p.id}.csv`,['Código','Nombre','Categoría','Longitud cm','Color','Calidad','Compra Bs/g','Venta Bs/g','Peso g','Stock mínimo g'],[[p.id,p.name,categoryLabel(p.category),p.length,p.color,p.quality,p.purchasePrice,p.salePrice,p.quantity,p.threshold]]);}
}
