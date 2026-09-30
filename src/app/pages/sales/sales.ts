import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DemoStore, HairCategory, HairLength, HairLine, OperationStatus, Sale, categoryLabel, dateLabel, downloadCsv, hairCategories, modifiedLabel, money, operationName, operationValue, operationWeight, productName, todayLocal, weight } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

type LineDraft = { category: HairCategory | ''; length: HairLength | ''; quantity: number; unitPrice: number };
type SortKey = 'customer' | 'value' | 'weight' | 'date' | 'status';
const blankLine = (): LineDraft => ({ category: '', length: '', quantity: 0, unitPrice: 0 });

@Component({ selector: 'app-sales', standalone: true, imports: [FormsModule, Icon], templateUrl: './sales.html', styleUrls: ['./sales.css', '../../shared/operation.css'] })
export class Sales {
  readonly store = inject(DemoStore);
  readonly categories = hairCategories;
  readonly money = money;
  readonly weight = weight;
  readonly dateLabel = dateLabel;
  readonly modifiedLabel = modifiedLabel;
  readonly operationName = operationName;
  readonly operationValue = operationValue;
  readonly operationWeight = operationWeight;
  readonly categoryLabel = categoryLabel;
  readonly page = signal(1);
  readonly modalOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly detailId = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('detalle'));
  readonly error = signal('');
  readonly detailError = signal('');
  readonly pendingPrompt = signal(false);
  readonly statusFilter = signal('');
  readonly sortKey = signal<SortKey>('date');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');
  draft = { customer: '', date: todayLocal(), status: 'Confirmado' as OperationStatus };
  lines: LineDraft[] = [blankLine()];

  readonly filtered = computed(() => this.store.sales().filter(sale => {
    const query = this.store.query().toLowerCase();
    const content = `${sale.customer} ${sale.date} ${sale.items.map(item => productName(item.category, item.length)).join(' ')}`.toLowerCase();
    return content.includes(query) && (!this.statusFilter() || sale.status === this.statusFilter());
  }));
  readonly sorted = computed(() => {
    const key = this.sortKey();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    const value = (sale: Sale): string | number => {
      switch (key) {
        case 'customer': return sale.customer;
        case 'value': return operationValue(sale.items);
        case 'weight': return operationWeight(sale.items);
        case 'date': return sale.date;
        case 'status': return sale.status;
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
  readonly detail = computed(() => this.store.sales().find(sale => sale.id === this.detailId()));
  sortBy(key: SortKey) {
    if (this.sortKey() === key) this.sortDirection.update(direction => direction === 'asc' ? 'desc' : 'asc');
    else { this.sortKey.set(key); this.sortDirection.set('asc'); }
    this.page.set(1);
  }
  sortAria(key: SortKey) { return this.sortKey() === key ? this.sortDirection() === 'asc' ? 'ascending' : 'descending' : 'none'; }
  sortIndicator(key: SortKey) { return this.sortKey() === key ? this.sortDirection() === 'asc' ? '↑' : '↓' : '↕'; }

  lengthsFor(category: HairCategory | '') {
    return [...new Set(this.store.products().filter(product => product.category === category).map(product => product.length))].sort((a, b) => a - b);
  }
  open() {
    this.editingId.set(null);
    this.draft = { customer: '', date: todayLocal(), status: 'Confirmado' };
    this.lines = [blankLine()];
    this.error.set('');
    this.pendingPrompt.set(false);
    this.modalOpen.set(true);
  }
  openEdit(sale: Sale) {
    this.detailId.set(null);
    this.editingId.set(sale.id);
    this.draft = { customer: sale.customer, date: sale.date, status: sale.status };
    this.lines = sale.items.map(item => ({ category: item.category, length: item.length, quantity: item.quantity, unitPrice: item.unitPrice }));
    this.error.set('');
    this.pendingPrompt.set(false);
    this.modalOpen.set(true);
  }
  openDetail(id: string) { this.detailError.set(''); this.detailId.set(id); }
  confirm(id: string) { this.detailError.set(this.store.confirmSale(id)); }
  addLine() { this.lines.push(blankLine()); }
  removeLine(index: number) { if (this.lines.length > 1) this.lines.splice(index, 1); }
  selectCategory(line: LineDraft) { line.length = ''; line.unitPrice = 0; }
  selectLength(line: LineDraft) {
    const product = this.store.products().find(item => item.category === line.category && item.length === Number(line.length));
    line.unitPrice = product?.salePrice ?? 0;
  }
  get draftValue() { return this.lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0); }
  save(usePending = false) {
    const customer = this.draft.customer.trim();
    if (!customer || !this.draft.date) { this.error.set('Completa el cliente y la fecha de venta.'); return; }
    const items: HairLine[] = [];
    const used = new Set<string>();
    const previous = this.store.sales().find(sale => sale.id === this.editingId());
    for (const line of this.lines) {
      const product = this.store.products().find(item => item.category === line.category && item.length === Number(line.length));
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      if (!product || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        this.error.set('Cada cabello necesita calidad, longitud, peso mayor que cero y precio válido.'); return;
      }
      if (used.has(product.id)) { this.error.set('Cada combinación de calidad y longitud debe aparecer una sola vez.'); return; }
      used.add(product.id);
      const costPrice = previous?.items.find(item => item.productId === product.id)?.costPrice ?? product.purchasePrice;
      items.push({ productId: product.id, category: product.category, length: product.length, quantity, unitPrice, costPrice });
    }
    const editing = this.editingId();
    const next = Math.max(2088, ...this.store.sales().map(sale => Number(sale.id.replace('VTA-', '')) || 0)) + 1;
    const sale = { id: editing ?? `VTA-${next}`, customer, date: this.draft.date, status: this.draft.status, items };
    const result = editing ? this.store.updateSale(sale, usePending) : this.store.addSale(sale, usePending);
    if (result.kind === 'error') { this.pendingPrompt.set(false); this.error.set(result.message); return; }
    if (result.kind === 'insufficient') {
      this.pendingPrompt.set(false);
      this.error.set(`No hay suficiente ${productName(result.product.category, result.product.length)}. Disponible para venta: ${weight(result.available)}; en compras pendientes: ${weight(result.pending)}.`);
      return;
    }
    if (result.kind === 'needs-pending') {
      this.error.set('');
      this.pendingPrompt.set(true);
      return;
    }
    this.pendingPrompt.set(false);
    this.page.set(1);
    this.modalOpen.set(false);
  }
  export() {
    downloadCsv('ventas-cabello.csv', ['Venta', 'Fecha', 'Cliente', 'Calidad', 'Longitud cm', 'Peso g', 'Precio Bs/g', 'Importe Bs', 'Estado'],
      this.sorted().flatMap(sale => sale.items.map(item => [operationName(sale.date, sale.customer), sale.date, sale.customer, categoryLabel(item.category), item.length, item.quantity, item.unitPrice, item.quantity * item.unitPrice, sale.status])));
  }
}
