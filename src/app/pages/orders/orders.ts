import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DemoStore, HairCategory, HairLength, HairLine, OperationStatus, Order, categoryLabel, dateLabel, downloadCsv, modifiedLabel, operationName, operationValue, operationWeight, productName, todayLocal, weight, money } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

type LineDraft = { category: HairCategory | ''; length: HairLength | ''; quantity: number; unitPrice: number };
type SortKey = 'supplier' | 'value' | 'weight' | 'date' | 'status';
const blankLine = (): LineDraft => ({ category: '', length: '', quantity: 0, unitPrice: 0 });

@Component({ selector: 'app-orders', standalone: true, imports: [FormsModule, Icon], templateUrl: './orders.html', styleUrls: ['./orders.css', '../../shared/operation.css'] })
export class Orders {
  readonly store = inject(DemoStore);
  readonly categories = this.store.categories;
  readonly money = money;
  readonly weight = weight;
  readonly dateLabel = dateLabel;
  readonly modifiedLabel = modifiedLabel;
  readonly operationName = operationName;
  readonly operationValue = operationValue;
  readonly operationWeight = operationWeight;
  readonly productName = productName;
  readonly categoryLabel = categoryLabel;
  readonly page = signal(1);
  readonly modalOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly detailId = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('detalle'));
  readonly error = signal('');
  readonly detailError = signal('');
  readonly statusFilter = signal('');
  readonly sortKey = signal<SortKey>('date');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');
  draft = { supplier: '', date: todayLocal(), status: 'Confirmado' as OperationStatus };
  lines: LineDraft[] = [blankLine()];

  readonly filtered = computed(() => this.store.orders().filter(order => {
    const query = this.store.query().toLowerCase();
    const content = `${order.supplier} ${order.date} ${order.items.map(item => productName(item.category, item.length)).join(' ')}`.toLowerCase();
    return content.includes(query) && (!this.statusFilter() || order.status === this.statusFilter());
  }));
  readonly sorted = computed(() => {
    const key = this.sortKey();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    const value = (order: Order): string | number => {
      switch (key) {
        case 'supplier': return order.supplier;
        case 'value': return operationValue(order.items);
        case 'weight': return operationWeight(order.items);
        case 'date': return order.date;
        case 'status': return order.status;
      }
    };
    return [...this.filtered()].sort((left, right) => {
      const a = value(left);
      const b = value(right);
      const comparison = typeof a === 'number' && typeof b === 'number'
        ? a - b : String(a).localeCompare(String(b), 'es-BO', { sensitivity: 'base' });
      return direction * comparison || right.date.localeCompare(left.date) || right.id.localeCompare(left.id);
    });
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 7)));
  readonly pageItems = computed(() => this.sorted().slice((Math.min(this.page(), this.pageCount()) - 1) * 7, Math.min(this.page(), this.pageCount()) * 7));
  readonly detail = computed(() => this.store.orders().find(order => order.id === this.detailId()));
  sortBy(key: SortKey) {
    if (this.sortKey() === key) this.sortDirection.update(direction => direction === 'asc' ? 'desc' : 'asc');
    else { this.sortKey.set(key); this.sortDirection.set('asc'); }
    this.page.set(1);
  }
  setMobileSort(value: string) {
    const [key, direction] = value.split(':') as [SortKey, 'asc' | 'desc'];
    this.sortKey.set(key); this.sortDirection.set(direction); this.page.set(1);
  }
  sortAria(key: SortKey) { return this.sortKey() === key ? this.sortDirection() === 'asc' ? 'ascending' : 'descending' : 'none'; }
  sortIndicator(key: SortKey) { return this.sortKey() === key ? this.sortDirection() === 'asc' ? '↑' : '↓' : '↕'; }

  lengthsFor(category: HairCategory | '') {
    return category ? this.store.lengths() : [];
  }
  open() {
    this.editingId.set(null);
    this.draft = { supplier: '', date: todayLocal(), status: 'Confirmado' };
    this.lines = [blankLine()];
    this.error.set('');
    this.modalOpen.set(true);
  }
  openEdit(order: Order) {
    this.detailId.set(null);
    this.editingId.set(order.id);
    this.draft = { supplier: order.supplier, date: order.date, status: order.status };
    this.lines = order.items.map(item => ({ category: item.category, length: item.length, quantity: item.quantity, unitPrice: item.unitPrice }));
    this.error.set('');
    this.modalOpen.set(true);
  }
  openDetail(id: string) { this.detailError.set(''); this.detailId.set(id); }
  addLine() { this.lines.push(blankLine()); }
  removeLine(index: number) { if (this.lines.length > 1) this.lines.splice(index, 1); }
  selectCategory(line: LineDraft) { line.length = ''; line.unitPrice = 0; }
  selectLength(line: LineDraft) {
    const product = this.store.products().find(item => item.category === line.category && item.length === Number(line.length));
    line.unitPrice = product?.purchasePrice ?? 0;
  }
  get draftValue() { return this.lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0); }
  confirm(id: string) { this.detailError.set(this.store.confirmOrder(id)); }
  save() {
    const supplier = this.draft.supplier.trim();
    if (!supplier || !this.draft.date) { this.error.set('Completa el proveedor y la fecha de compra.'); return; }
    const items: HairLine[] = [];
    const used = new Set<string>();
    for (const line of this.lines) {
      const product = this.store.products().find(item => item.category === line.category && item.length === Number(line.length));
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      if (!this.store.categories().includes(line.category) || !this.store.lengths().includes(Number(line.length)) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        this.error.set('Cada cabello necesita calidad, longitud, peso mayor que cero y precio válido.'); return;
      }
      const key = `${line.category}:${Number(line.length)}`;
      if (used.has(key)) { this.error.set('Cada combinación de calidad y longitud debe aparecer una sola vez.'); return; }
      used.add(key);
      items.push({ productId: product?.id ?? '', category: line.category, length: Number(line.length), quantity, unitPrice });
    }
    if (this.editingId()) {
      const message = this.store.updateOrder({ id: this.editingId()!, supplier, date: this.draft.date, status: this.draft.status, items });
      if (message) { this.error.set(message); return; }
    } else {
      const next = Math.max(1046, ...this.store.orders().map(order => Number(order.id.replace('COMP-', '')) || 0)) + 1;
      this.store.addOrder({ id: `COMP-${next}`, supplier, date: this.draft.date, status: this.draft.status, items });
    }
    this.page.set(1);
    this.modalOpen.set(false);
  }
  export() {
    downloadCsv('compras-cabello.csv', ['Compra', 'Fecha', 'Proveedor', 'Calidad', 'Longitud cm', 'Peso g', 'Precio Bs/g', 'Importe Bs', 'Estado'],
      this.sorted().flatMap(order => order.items.map(item => [operationName(order.date, order.supplier), order.date, order.supplier, categoryLabel(item.category), item.length, item.quantity, item.unitPrice, item.quantity * item.unitPrice, order.status])));
  }
}
