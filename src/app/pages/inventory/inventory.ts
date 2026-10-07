import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DemoStore, HairCategory, HairLength, HairLine, categoryLabel, downloadCsv, money, weight } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

type StockSortKey = 'category' | 'length' | 'quantity' | 'pendingPurchase' | 'reserved' | 'immediate' | 'additional';
type PendingSortKey = 'party' | 'category' | 'length' | 'quantity' | 'unitPrice' | 'value';

@Component({ selector: 'app-inventory', standalone: true, imports: [FormsModule, RouterLink, Icon], templateUrl: './inventory.html',
  styleUrl: './inventory.css' })
export class Inventory {
  readonly store = inject(DemoStore); readonly money = money; readonly weight = weight; readonly categoryLabel = categoryLabel;
  pendingPurchase(productId: string) { return this.store.pendingPurchaseWeight(productId); }
  reserved(productId: string) { return this.store.pendingSaleWeight(productId); }
  immediate(productId: string) { return this.store.sellableWeight(productId); }
  additional(productId: string) { return this.store.reservableWeight(productId) - this.immediate(productId); }
  readonly page = signal(1); readonly typesOpen = signal(false); readonly error = signal('');
  readonly pendingTab = signal<'purchases' | 'sales'>('purchases');
  readonly sortKey = signal<StockSortKey>('category');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');
  readonly pendingSortKey = signal<PendingSortKey>('party');
  readonly pendingSortDirection = signal<'asc' | 'desc'>('asc');
  readonly pendingPurchaseCount = computed(() => this.store.orders().filter(order => order.status === 'Pendiente').length);
  readonly pendingSaleCount = computed(() => this.store.sales().filter(sale => sale.status === 'Pendiente').length);
  readonly pendingPurchases = computed(() => this.store.orders().filter(order => order.status === 'Pendiente').flatMap(order => order.items.map(item => ({ order, item, party: order.supplier }))));
  readonly pendingSales = computed(() => this.store.sales().filter(sale => sale.status === 'Pendiente').flatMap(sale => sale.items.map(item => ({ sale, item, party: sale.customer }))));
  readonly sortedPendingPurchases = computed(() => this.sortPending(this.pendingPurchases()));
  readonly sortedPendingSales = computed(() => this.sortPending(this.pendingSales()));
  readonly category = signal(''); readonly length = signal<number | ''>('');
  readonly filtered = computed(() => this.store.managedProducts().filter(p =>
    (!this.category() || p.category === this.category())
    && (!this.length() || p.length === Number(this.length()))
    && `${p.category} ${p.length}`.toLocaleLowerCase('es-BO').includes(this.store.query().toLocaleLowerCase('es-BO'))));
  readonly sorted = computed(() => {
    const key = this.sortKey();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    return [...this.filtered()].sort((left, right) => {
      const stockValue = (product: typeof left) => key === 'pendingPurchase' ? this.pendingPurchase(product.id)
        : key === 'reserved' ? this.reserved(product.id)
        : key === 'immediate' ? this.immediate(product.id)
        : key === 'additional' ? this.additional(product.id)
        : product[key];
      const comparison = key === 'category'
        ? left.category.localeCompare(right.category, 'es-BO', { sensitivity: 'base' })
        : Number(stockValue(left)) - Number(stockValue(right));
      return direction * comparison || left.category.localeCompare(right.category, 'es-BO') || left.length - right.length;
    });
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 7)));
  readonly pageItems = computed(() => this.sorted().slice((Math.min(this.page(),this.pageCount())-1)*7, Math.min(this.page(),this.pageCount())*7));
  sortBy(key: StockSortKey) {
    if (this.sortKey() === key) this.sortDirection.update(direction => direction === 'asc' ? 'desc' : 'asc');
    else { this.sortKey.set(key); this.sortDirection.set('asc'); }
    this.page.set(1);
  }
  setMobileSort(value: string) {
    const [key, direction] = value.split(':') as [StockSortKey, 'asc' | 'desc'];
    this.sortKey.set(key); this.sortDirection.set(direction); this.page.set(1);
  }
  setMobilePendingSort(value: string) {
    const [key, direction] = value.split(':') as [PendingSortKey, 'asc' | 'desc'];
    this.pendingSortKey.set(key); this.pendingSortDirection.set(direction);
  }
  sortAria(key: StockSortKey) { return this.sortKey() === key ? this.sortDirection() === 'asc' ? 'ascending' : 'descending' : 'none'; }
  sortIndicator(key: StockSortKey) { return this.sortKey() === key ? this.sortDirection() === 'asc' ? '↑' : '↓' : '↕'; }
  sortPendingBy(key: PendingSortKey) {
    if (this.pendingSortKey() === key) this.pendingSortDirection.update(direction => direction === 'asc' ? 'desc' : 'asc');
    else { this.pendingSortKey.set(key); this.pendingSortDirection.set('asc'); }
  }
  pendingSortAria(key: PendingSortKey) { return this.pendingSortKey() === key ? this.pendingSortDirection() === 'asc' ? 'ascending' : 'descending' : 'none'; }
  pendingSortIndicator(key: PendingSortKey) { return this.pendingSortKey() === key ? this.pendingSortDirection() === 'asc' ? '↑' : '↓' : '↕'; }
  private sortPending<T extends { party: string; item: HairLine }>(entries: T[]): T[] {
    const key = this.pendingSortKey();
    const direction = this.pendingSortDirection() === 'asc' ? 1 : -1;
    const value = (entry: T) => key === 'party' ? entry.party : key === 'value' ? entry.item.quantity * entry.item.unitPrice : entry.item[key];
    return [...entries].sort((left, right) => {
      const a = value(left); const b = value(right);
      const comparison = typeof a === 'number' && typeof b === 'number'
        ? a - b : String(a).localeCompare(String(b), 'es-BO', { sensitivity: 'base' });
      return direction * comparison || left.party.localeCompare(right.party, 'es-BO')
        || left.item.category.localeCompare(right.item.category, 'es-BO') || left.item.length - right.item.length;
    });
  }
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
  export() { downloadCsv('inventario-cabellos.csv', ['Categoría', 'Longitud cm', 'Stock g', 'Por recibir g', 'Reservado g', 'Disponible hoy g', 'Reserva adicional g'],
    this.filtered().map(p => [categoryLabel(p.category), p.length, p.quantity, this.pendingPurchase(p.id), this.reserved(p.id), this.immediate(p.id), this.additional(p.id)])); }
}
