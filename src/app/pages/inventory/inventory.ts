import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DemoStore, Product, categoryLabel, downloadCsv, hairCategories, hairLengths, money, productName, weight } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

const blankProduct = (): Product => ({ id: '', name: '', category: 'normal', length: 38, purchasePrice: 0, salePrice: 0, quantity: 0, threshold: 0, unit: 'g', color: '', quality: '', supplier: '', sold: 0 });

@Component({ selector: 'app-inventory', standalone: true, imports: [FormsModule, RouterLink, Icon], templateUrl: './inventory.html',
  styleUrl: './inventory.css' })
export class Inventory {
  readonly store = inject(DemoStore); readonly money = money; readonly weight = weight; readonly categoryLabel = categoryLabel;
  readonly categories = hairCategories; readonly lengths = hairLengths;
  readonly page = signal(1); readonly modalOpen = signal(false); readonly error = signal('');
  readonly pendingTab = signal<'purchases' | 'sales'>('purchases');
  readonly pendingPurchaseCount = computed(() => this.store.orders().filter(order => order.status === 'Pendiente').length);
  readonly pendingSaleCount = computed(() => this.store.sales().filter(sale => sale.status === 'Pendiente').length);
  readonly pendingPurchases = computed(() => this.store.orders().filter(order => order.status === 'Pendiente').flatMap(order => order.items.map(item => ({ order, item }))));
  readonly pendingSales = computed(() => this.store.sales().filter(sale => sale.status === 'Pendiente').flatMap(sale => sale.items.map(item => ({ sale, item }))));
  readonly category = signal(''); readonly length = signal<number | ''>(''); draft = blankProduct();
  readonly totalWeight = computed(() => this.store.products().reduce((sum,p) => sum+this.store.sellableWeight(p.id),0));
  readonly physicalWeight = computed(() => this.store.products().reduce((sum,p) => sum+p.quantity,0));
  readonly stockValue = computed(() => this.store.products().reduce((sum,p) => sum+p.quantity*p.purchasePrice,0));
  readonly lowCount = computed(() => this.store.products().filter(p => this.store.sellableWeight(p.id)<=p.threshold).length);
  readonly filtered = computed(() => this.store.products().filter(p => (!this.category() || p.category === this.category()) && (!this.length() || p.length === Number(this.length())) && `${p.name} ${p.id} ${p.category} ${p.length} ${p.color} ${p.quality} ${p.supplier}`.toLowerCase().includes(this.store.query().toLowerCase())));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 7)));
  readonly pageItems = computed(() => this.filtered().slice((Math.min(this.page(),this.pageCount())-1)*7, Math.min(this.page(),this.pageCount())*7));
  get generatedName() { return productName(this.draft.category, this.draft.length); }
  openCreate() { this.draft = blankProduct(); this.error.set(''); this.modalOpen.set(true); }
  close() { this.modalOpen.set(false); }
  save() {
    if (!this.draft.id.trim() || !this.draft.color.trim() || !this.draft.quality.trim()) { this.error.set('Completa código, color y calidad.'); return; }
    if (this.store.products().some(p => p.id.toLowerCase() === this.draft.id.toLowerCase())) { this.error.set('Ese código de producto ya existe.'); return; }
    if (this.store.products().some(p => p.category === this.draft.category && p.length === this.draft.length)) { this.error.set('Ya existe un producto con esa categoría y longitud.'); return; }
    if (this.draft.salePrice < this.draft.purchasePrice) { this.error.set('El precio de venta no puede ser menor al precio de compra.'); return; }
    this.store.addProduct({...this.draft, name: this.generatedName}); this.page.set(1); this.close();
  }
  export() { downloadCsv('inventario-cabellos-vero.csv',['Código','Producto','Categoría','Longitud cm','Color','Calidad','Compra Bs/g','Venta Bs/g','Stock físico g','Disponible g','Stock mínimo g','Estado'],this.filtered().map(p=>[p.id,p.name,categoryLabel(p.category),p.length,p.color,p.quality,p.purchasePrice,p.salePrice,p.quantity,this.store.sellableWeight(p.id),p.threshold,this.store.availabilityStatus(p)])); }
}
