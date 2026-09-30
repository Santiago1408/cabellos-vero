import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoStore, Supplier, downloadCsv, weight } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

const blankSupplier=():Supplier=>({id:'',name:'',product:'',phone:'',email:'',returns:true,pending:0});
@Component({selector:'app-suppliers',standalone:true,imports:[FormsModule,Icon],templateUrl: './suppliers.html',
  styleUrl: './suppliers.css'})
export class Suppliers {
  readonly store=inject(DemoStore);readonly weight=weight;readonly modalOpen=signal(false);readonly error=signal('');readonly page=signal(1);readonly returnFilter=signal(''); draft=blankSupplier();
  readonly filtered=computed(()=>this.store.suppliers().filter(s=>`${s.name} ${s.product} ${s.email}`.toLowerCase().includes(this.store.query().toLowerCase())&&(!this.returnFilter()||(this.returnFilter()==='si')===s.returns)));
  readonly pageCount=computed(()=>Math.max(1,Math.ceil(this.filtered().length/8)));
  readonly pageItems=computed(()=>this.filtered().slice((Math.min(this.page(),this.pageCount())-1)*8,Math.min(this.page(),this.pageCount())*8));
  open(){this.draft=blankSupplier();this.error.set('');this.modalOpen.set(true);}
  save(){if(!this.draft.name.trim()||!this.draft.product.trim()||!this.draft.phone.trim()){this.error.set('Completa nombre, producto y teléfono.');return;}this.store.addSupplier({...this.draft,id:`SUP-${String(this.store.suppliers().length+1).padStart(3,'0')}`});this.page.set(1);this.modalOpen.set(false);}
  export(){downloadCsv('proveedores-cabellos-vero.csv',['Proveedor','Categoría principal','Teléfono','Correo','Acepta devoluciones','Peso en camino g'],this.filtered().map(s=>[s.name,s.product,s.phone,s.email,s.returns?'Sí':'No',s.pending]));}
}
