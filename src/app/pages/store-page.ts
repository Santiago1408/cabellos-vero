import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoStore } from '../data/demo-store';
import { Icon } from '../shared/icon';

@Component({selector:'app-store-page',standalone:true,imports:[FormsModule,Icon],template:`
  <div class="page-header"><div><div class="eyebrow">NEGOCIO</div><h1>Mi tienda</h1><p>Información principal de Cabellos Vero.</p></div>@if(store.role()==='admin'){<button class="btn btn-primary" (click)="open()"><app-icon name="edit"/> Editar datos</button>}</div>
  <section class="card store-card"><div class="store-hero"><div class="store-logo">CV</div><span>UNA TIENDA · UN SOLO INVENTARIO</span></div><div class="store-info"><div class="eyebrow">DATOS DE LA TIENDA</div><h2>{{store.storeName()}}</h2><div class="store-info-grid"><div><small>Dirección</small><strong>{{store.storeAddress()}}</strong></div><div><small>Teléfono</small><strong>{{store.storePhone()}}</strong></div><div><small>Administrador</small><strong>{{store.displayName()}}</strong></div><div><small>Productos registrados</small><strong>{{store.products().length}}</strong></div></div></div></section>
  @if(editing()){<div class="modal-backdrop" (click)="editing.set(false)"><section class="modal-card small-modal" role="dialog" aria-modal="true" aria-label="Editar tienda" (click)="$event.stopPropagation()"><div class="modal-header"><h2>Editar datos de la tienda</h2><button class="icon-button" aria-label="Cerrar" (click)="editing.set(false)"><app-icon name="close"/></button></div><form class="modal-form" (ngSubmit)="save()"><label class="field-label">Nombre<input class="field-input" name="name" [(ngModel)]="name" required /></label><label class="field-label">Dirección<input class="field-input" name="address" [(ngModel)]="address" required /></label><label class="field-label">Teléfono<input class="field-input" name="phone" [(ngModel)]="phone" required /></label><div class="modal-actions"><button type="button" class="btn btn-outline" (click)="editing.set(false)">Cancelar</button><button class="btn btn-primary" type="submit">Guardar cambios</button></div></form></section></div>}
`})
export class StorePage {
  readonly store=inject(DemoStore);readonly editing=signal(false);name='';address='';phone='';
  open(){this.name=this.store.storeName();this.address=this.store.storeAddress();this.phone=this.store.storePhone();this.editing.set(true);}
  save(){if(!this.name.trim()||!this.address.trim())return;this.store.storeName.set(this.name);this.store.storeAddress.set(this.address);this.store.storePhone.set(this.phone);this.editing.set(false);}
}
