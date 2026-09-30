import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DemoStore, HairCategory, HairLength, categoryLabel, downloadCsv, money, weight } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

@Component({ selector: 'app-inventory', standalone: true, imports: [FormsModule, RouterLink, Icon], templateUrl: './inventory.html',
  styleUrl: './inventory.css' })
export class Inventory {
  readonly store = inject(DemoStore); readonly money = money; readonly weight = weight; readonly categoryLabel = categoryLabel;
  readonly page = signal(1); readonly typesOpen = signal(false); readonly error = signal('');
  readonly pendingTab = signal<'purchases' | 'sales'>('purchases');
  readonly pendingPurchaseCount = computed(() => this.store.orders().filter(order => order.status === 'Pendiente').length);
  readonly pendingSaleCount = computed(() => this.store.sales().filter(sale => sale.status === 'Pendiente').length);
  readonly pendingPurchases = computed(() => this.store.orders().filter(order => order.status === 'Pendiente').flatMap(order => order.items.map(item => ({ order, item }))));
  readonly pendingSales = computed(() => this.store.sales().filter(sale => sale.status === 'Pendiente').flatMap(sale => sale.items.map(item => ({ sale, item }))));
  readonly category = signal(''); readonly length = signal<number | ''>('');
  readonly filtered = computed(() => this.store.products().filter(p =>
    (p.quantity > 0 || this.store.orders().some(order => order.status === 'Confirmado' && order.items.some(item => item.productId === p.id)))
    && (!this.category() || p.category === this.category())
    && (!this.length() || p.length === Number(this.length()))
    && `${p.category} ${p.length}`.toLocaleLowerCase('es-BO').includes(this.store.query().toLocaleLowerCase('es-BO'))));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 7)));
  readonly pageItems = computed(() => this.filtered().slice((Math.min(this.page(),this.pageCount())-1)*7, Math.min(this.page(),this.pageCount())*7));
  newCategory = '';
  newLength: number | null = null;
  openTypes() { this.newCategory = ''; this.newLength = null; this.error.set(''); this.typesOpen.set(true); }
  closeTypes() { this.typesOpen.set(false); }
  addCategory() {
    const message = this.store.addCategory(this.newCategory);
    this.error.set(message);
    if (!message) { this.newCategory = ''; this.page.set(1); }
  }
  addLength() {
    const message = this.store.addLength(Number(this.newLength));
    this.error.set(message);
    if (!message) { this.newLength = null; this.page.set(1); }
  }
  removeCategory(category: HairCategory) {
    const message = this.store.removeCategory(category);
    this.error.set(message);
    if (!message) { if (this.category() === category) this.category.set(''); this.page.set(1); }
  }
  removeLength(length: HairLength) {
    const message = this.store.removeLength(length);
    this.error.set(message);
    if (!message) { if (this.length() === length) this.length.set(''); this.page.set(1); }
  }
  export() { downloadCsv('inventario-cabellos.csv', ['Categoría', 'Longitud cm', 'Stock g'],
    this.filtered().map(p => [categoryLabel(p.category), p.length, p.quantity])); }
}
