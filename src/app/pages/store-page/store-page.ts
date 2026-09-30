import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoStore } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

@Component({selector:'app-store-page',standalone:true,imports:[FormsModule,Icon],templateUrl: './store-page.html',
  styleUrl: './store-page.css'})
export class StorePage {
  readonly store=inject(DemoStore);readonly editing=signal(false);name='';address='';phone='';
  open(){this.name=this.store.storeName();this.address=this.store.storeAddress();this.phone=this.store.storePhone();this.editing.set(true);}
  save(){if(!this.name.trim()||!this.address.trim())return;this.store.storeName.set(this.name);this.store.storeAddress.set(this.address);this.store.storePhone.set(this.phone);this.editing.set(false);}
}
