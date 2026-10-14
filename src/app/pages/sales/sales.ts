import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DemoStore, Fulfillment, HairCategory, HairLength, HairLine, OperationPayment, OperationPaymentMethod, OperationStatus, Sale, businessTime, categoryLabel, dateLabel, downloadCsv, eventValue, eventWeight, fulfilledQuantity, fulfilledWeight, fulfillmentSummary, lineValue, modifiedLabel, money, movementAt, operationBalance, operationEvents, operationName, operationPaid, operationPayableTotal, operationValue, operationWeight, productName, remainingQuantity, todayLocal, unitPriceLabel, weight } from '../../data/demo-store';
import { hasTwoDecimalPlaces, sumMoney } from '../../data/money';
import { Icon } from '../../shared/icon/icon';
import { OperationHistory } from '../../shared/operation-history/operation-history';

type LineDraft = { category: HairCategory | ''; length: HairLength | ''; quantity: number; unitPrice: number };
type SortKey = 'customer' | 'value' | 'weight' | 'date' | 'status';
const blankLine = (): LineDraft => ({ category: '', length: '', quantity: 0, unitPrice: 0 });

@Component({ selector: 'app-sales', standalone: true, imports: [FormsModule, Icon, OperationHistory], templateUrl: './sales.html', styleUrls: ['./sales.css', '../../shared/operation.css'] })
export class Sales {
  readonly store = inject(DemoStore);
  readonly categories = this.store.categories;
  readonly money = money;
  readonly weight = weight;
  readonly dateLabel = dateLabel;
  readonly modifiedLabel = modifiedLabel;
  readonly operationName = operationName;
  readonly operationValue = operationValue;
  readonly lineValue = lineValue;
  readonly unitPriceLabel = unitPriceLabel;
  readonly operationWeight = operationWeight;
  readonly operationEvents = operationEvents;
  readonly fulfilledQuantity = fulfilledQuantity;
  readonly remainingQuantity = remainingQuantity;
  readonly fulfilledWeight = fulfilledWeight;
  readonly eventValue = eventValue;
  readonly eventWeight = eventWeight;
  readonly fulfillmentSummary = fulfillmentSummary;
  readonly operationPaid = operationPaid;
  readonly operationBalance = operationBalance;
  readonly operationPayableTotal = operationPayableTotal;
  readonly categoryLabel = categoryLabel;
  readonly page = signal(1);
  readonly modalOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly detailId = signal<string | null>(inject(ActivatedRoute).snapshot.queryParamMap.get('detalle'));
  readonly error = signal('');
  readonly detailError = signal('');
  readonly correctionError = signal('');
  readonly cancelPrompt = signal(false);
  confirmationDate = todayLocal();
  confirmationTime = businessTime();
  deliveryQuantities: Record<string, number> = {};
  correctionEventId: string | null = null;
  correctionDate = todayLocal();
  correctionTime = businessTime();
  correctionQuantities: Record<string, number> = {};
  correctionReason = '';
  editReason = '';
  paymentEditingId: string | null = null;
  paymentDraft = { date: todayLocal(), amount: 0, method: 'Efectivo' as OperationPaymentMethod, reference: '' };
  paymentReason = '';
  readonly pendingPrompt = signal(false);
  readonly statusFilter = signal('');
  readonly sortKey = signal<SortKey>('date');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');
  draft = { customer: '', date: todayLocal(), effectiveDate: todayLocal(), effectiveTime: businessTime(), status: 'Confirmado' as OperationStatus };
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
  readonly editingHasDeliveries = computed(() => {
    const sale = this.store.sales().find(item => item.id === this.editingId());
    return !!sale && operationEvents(sale).length > 0;
  });
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
    return [...new Set(this.store.products().filter(product => product.category === category).map(product => product.length))].sort((a, b) => a - b);
  }
  open() {
    this.editingId.set(null);
    this.draft = { customer: '', date: todayLocal(), effectiveDate: todayLocal(), effectiveTime: businessTime(), status: 'Confirmado' };
    this.lines = [blankLine()];
    this.error.set('');
    this.editReason = '';
    this.pendingPrompt.set(false);
    this.modalOpen.set(true);
  }
  openEdit(sale: Sale) {
    this.detailId.set(null);
    this.editingId.set(sale.id);
    this.draft = { customer: sale.customer, date: sale.date, effectiveDate: sale.effectiveDate ?? (sale.status === 'Pendiente' ? todayLocal() : sale.date),
      effectiveTime: sale.confirmedAt?.slice(11, 16) ?? (sale.status === 'Confirmado' ? '00:00' : businessTime()), status: sale.status };
    this.lines = sale.items.map(item => ({ category: item.category, length: item.length, quantity: item.quantity, unitPrice: item.unitPrice }));
    this.error.set('');
    this.editReason = '';
    this.pendingPrompt.set(false);
    this.modalOpen.set(true);
  }
  openDetail(id: string) { this.detailError.set(''); this.correctionError.set(''); this.cancelPrompt.set(false); this.confirmationDate = todayLocal(); this.confirmationTime = businessTime(); this.deliveryQuantities = {}; this.correctionEventId = null; this.resetPayment(); this.detailId.set(id); }
  editDelivery(event: Fulfillment, sale: Sale) { this.correctionEventId = event.id; this.correctionDate = event.at.slice(0, 10);
    this.correctionTime = event.at.slice(11, 16); this.correctionQuantities = Object.fromEntries(sale.items
      .map(item => [item.productId, event.items.find(part => part.productId === item.productId)?.quantity ?? 0]));
    this.correctionReason = ''; this.correctionError.set(''); }
  saveDeliveryCorrection(saleId: string) { const message = this.store.correctFulfillment('sale', saleId, this.correctionEventId!,
    this.correctionDate, this.correctionTime, Object.entries(this.correctionQuantities).filter(([, quantity]) => Number(quantity) > 0)
      .map(([productId, quantity]) => ({ productId, quantity: Number(quantity) })), this.correctionReason);
    this.correctionError.set(message); if (!message) this.correctionEventId = null; }
  voidDelivery(saleId: string) { const message = this.store.correctFulfillment('sale', saleId, this.correctionEventId!,
    this.correctionDate, this.correctionTime, [], this.correctionReason);
    this.correctionError.set(message); if (!message) this.correctionEventId = null; }
  resetPayment() { this.paymentEditingId = null; this.paymentDraft = { date: todayLocal(), amount: 0, method: 'Efectivo', reference: '' }; this.paymentReason = ''; }
  editPayment(payment: OperationPayment) { this.paymentEditingId = payment.id; this.paymentDraft = {
    date: payment.date, amount: payment.amount, method: payment.method, reference: payment.reference }; this.paymentReason = ''; }
  savePayment(saleId: string) {
    const message = this.paymentEditingId
      ? this.store.updateOperationPayment('sale', saleId, this.paymentEditingId, this.paymentDraft, this.paymentReason)
      : this.store.addOperationPayment('sale', saleId, this.paymentDraft);
    this.detailError.set(message);
    if (!message) this.resetPayment();
  }
  voidPayment(saleId: string) { const message = this.store.voidOperationPayment('sale', saleId, this.paymentEditingId!, this.paymentReason);
    this.detailError.set(message); if (!message) this.resetPayment(); }
  confirm(id: string) { this.detailError.set(this.store.deliverSale(id, Object.entries(this.deliveryQuantities)
    .filter(([, quantity]) => Number(quantity) > 0).map(([productId, quantity]) => ({ productId, quantity: Number(quantity) })), this.confirmationDate, this.confirmationTime));
    if (!this.detailError()) this.deliveryQuantities = {}; }
  fillRemaining(sale: Sale) { this.deliveryQuantities = Object.fromEntries(sale.items
    .map(item => [item.productId, remainingQuantity(sale, item.productId)])); }
  cancel(id: string) { const message = this.store.cancelSale(id); this.detailError.set(message); if (!message) this.cancelPrompt.set(false); }
  addLine() { this.lines.push(blankLine()); }
  removeLine(index: number) { if (this.lines.length > 1) this.lines.splice(index, 1); }
  selectCategory(line: LineDraft) { line.length = ''; line.unitPrice = 0; }
  selectLength(line: LineDraft) {
    const product = this.store.products().find(item => item.category === line.category && item.length === Number(line.length));
    line.unitPrice = product?.salePrice ?? 0;
  }
  get draftValue() { return sumMoney(this.lines.map(line => lineValue(Number(line.quantity) || 0, Number(line.unitPrice) || 0))); }
  save(usePending = false) {
    const customer = this.draft.customer.trim();
    if (!customer || !this.draft.date) { this.error.set('Completa el cliente y la fecha de venta.'); return; }
    const items: HairLine[] = [];
    const used = new Set<string>();
    for (const line of this.lines) {
      const product = this.store.products().find(item => item.category === line.category && item.length === Number(line.length));
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      if (!product || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        this.error.set('Cada cabello necesita calidad, longitud, peso mayor que cero y precio válido.'); return;
      }
      if (!hasTwoDecimalPlaces(quantity) || !hasTwoDecimalPlaces(unitPrice)) {
        this.error.set('El peso y el precio por gramo admiten como máximo dos decimales.'); return;
      }
      if (used.has(product.id)) { this.error.set('Cada combinación de calidad y longitud debe aparecer una sola vez.'); return; }
      used.add(product.id);
      items.push({ productId: product.id, category: product.category, length: product.length, quantity, unitPrice });
    }
    const editing = this.editingId();
    const next = Math.max(2088, ...this.store.sales().map(sale => Number(sale.id.replace('VTA-', '')) || 0)) + 1;
    const sale = { id: editing ?? `VTA-${next}`, customer, date: this.draft.date, effectiveDate: this.draft.status === 'Confirmado' ? this.draft.effectiveDate : undefined,
      confirmedAt: this.draft.status === 'Confirmado' && !this.editingHasDeliveries() ? movementAt(this.draft.effectiveDate, this.draft.effectiveTime) : undefined,
      status: this.draft.status, items };
    const result = editing ? this.store.updateSale(sale, usePending, 'Edición', this.editReason) : this.store.addSale(sale, usePending);
    if (result.kind === 'error') { this.pendingPrompt.set(false); this.error.set(result.message); return; }
    if (result.kind === 'insufficient') {
      this.pendingPrompt.set(false);
      this.error.set(`Venta rechazada. ${result.shortages.map(item => `${productName(item.product.category, item.product.length)}: solicitados ${item.requested} g, con respaldo ${item.physical + item.pending} g (${item.physical} g físicos y ${item.pending} g por recibir); faltan ${item.missing} g.`).join(' ')}`);
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
    downloadCsv('ventas-cabello.csv', ['ID venta', 'Venta', 'Fecha de registro', 'Fecha de entrega', 'Cliente', 'Estado', 'Modificada el', 'Anulada el', 'Línea', 'ID producto', 'Categoría', 'Longitud cm', 'Peso acordado g', 'Peso entregado g', 'Peso pendiente g', 'Precio Bs/g', 'Importe línea Bs', 'Importe venta Bs', 'Cobrado Bs', 'Saldo Bs', 'Entregas JSON', 'Cobros JSON', 'Historial de cambios JSON'],
      this.store.sales().flatMap(sale => sale.items.map((item, index) => [
        sale.id, operationName(sale.date, sale.customer), sale.date, sale.effectiveDate ?? '', sale.customer,
        sale.status, sale.modifiedAt ?? '', sale.cancelledAt ?? '', index + 1, item.productId,
        item.category, item.length, item.quantity, fulfilledQuantity(sale, item.productId), remainingQuantity(sale, item.productId),
        item.unitPrice, lineValue(item.quantity, item.unitPrice), operationValue(sale.items), operationPaid(sale), operationBalance(sale),
        JSON.stringify(operationEvents(sale)), JSON.stringify(sale.payments ?? []), JSON.stringify(sale.changeHistory ?? []),
      ])));
  }
}
