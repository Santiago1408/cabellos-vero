import { DatePipe, DecimalPipe, JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../data/api-client';
import { AuthSession } from '../../data/auth-session';
import { hasTwoDecimalPlaces, lineValue, sumMoney } from '../../data/money';
import { PurchaseDetail, PurchaseLine, PurchasePayment, PurchaseReceipt, PurchaseStatus, PurchaseSummary } from '../../data/purchase-api';
import { Icon } from '../../shared/icon/icon';

type Category = { code: string; displayName: string };
type Length = { centimeters: number };
type Supplier = { id: string; name: string };
type SortKey = 'supplier' | 'value' | 'weight' | 'date' | 'status';
type LineDraft = { id?: string; categoryCode: string; lengthCm: number | null; weight: number | null; receivedWeight?: number; pricePerGram: number | null };
type PaymentMethod = PurchasePayment['method'];

const emptyLine = (): LineDraft => ({ categoryCode: '', lengthCm: null, weight: null, pricePerGram: null });
const boliviaNow = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (part: string) => parts.find(item => item.type === part)?.value ?? '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
};

@Component({
  selector: 'app-connected-purchases',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, JsonPipe, Icon],
  templateUrl: './connected-purchases.html',
  styleUrls: ['./connected-purchases.css', '../../shared/operation.css'],
})
export class ConnectedPurchases implements OnInit {
  private readonly api = inject(ApiClient);
  readonly session = inject(AuthSession);
  readonly purchases = signal<PurchaseSummary[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly lengths = signal<Length[]>([]);
  readonly suppliers = signal<Supplier[]>([]);
  readonly detail = signal<PurchaseDetail | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly detailError = signal('');
  readonly formError = signal('');
  readonly message = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal(false);
  readonly statusFilter = signal('');
  readonly sortKey = signal<SortKey>('date');
  readonly sortDirection = signal<1 | -1>(-1);
  readonly page = signal(1);
  readonly filtered = computed(() => {
    const filter = this.statusFilter();
    const key = this.sortKey();
    const direction = this.sortDirection();
    return this.purchases().filter(row => !filter || row.status === filter).sort((left, right) => {
      const a: string | number = key === 'supplier' ? left.supplierName : key === 'value' ? left.agreedTotal
        : key === 'weight' ? left.agreedWeight : key === 'date' ? left.operationDate : left.status;
      const b: string | number = key === 'supplier' ? right.supplierName : key === 'value' ? right.agreedTotal
        : key === 'weight' ? right.agreedWeight : key === 'date' ? right.operationDate : right.status;
      const comparison = typeof a === 'number' && typeof b === 'number' ? a - b
        : String(a).localeCompare(String(b), 'es-BO', { numeric: true, sensitivity: 'base' });
      return direction * (comparison || left.createdAt.localeCompare(right.createdAt));
    });
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 7)));
  readonly pageItems = computed(() => this.filtered().slice((this.page() - 1) * 7, this.page() * 7));
  readonly lineValue = lineValue;
  dateLabel(value: string): string {
    const [year, month, day] = value.split('T')[0].split('-');
    return day && month && year ? `${day}/${month}/${year}` : value;
  }
  lastEdit(detail: PurchaseDetail): string | null {
    return detail.history.filter(change => change.eventType === 'PURCHASE_UPDATED')
      .reduce<string | null>((latest, change) => !latest || change.changedAt > latest ? change.changedAt : latest, null);
  }

  supplierId = '';
  operationDate = boliviaNow().date;
  receiveNow = true;
  effectiveDate = boliviaNow().date;
  effectiveTime = boliviaNow().time;
  lines: LineDraft[] = [emptyLine()];
  editReason = '';
  receiptDate = boliviaNow().date;
  receiptTime = boliviaNow().time;
  receiptWeights: Record<string, number | null> = {};
  correctionReceiptId: string | null = null;
  correctionReason = '';
  paymentEditingId: string | null = null;
  paymentDate = boliviaNow().date;
  paymentAmount: number | null = null;
  paymentMethod: PaymentMethod = 'CASH';
  paymentReference = '';
  paymentReason = '';
  cancelReason = '';
  showCancel = false;
  private pendingRequest: { fingerprint: string; key: string } | null = null;
  private pendingReceiptRequest: { fingerprint: string; key: string } | null = null;
  private pendingPaymentRequest: { fingerprint: string; key: string } | null = null;
  private editingVersion: number | null = null;
  editingConfirmed = false;

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [purchases, categories, lengths] = await Promise.all([
        this.api.get<PurchaseSummary[]>('/api/purchases'),
        this.api.get<Category[]>('/api/catalog/categories'),
        this.api.get<Length[]>('/api/catalog/lengths'),
      ]);
      this.purchases.set(purchases);
      this.categories.set(categories);
      this.lengths.set(lengths);
      if (this.session.account()?.role === 'ADMIN') {
        this.suppliers.set(await this.api.get<Supplier[]>('/api/suppliers'));
      }
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  sortBy(key: SortKey): void {
    if (this.sortKey() === key) this.sortDirection.update(value => value === 1 ? -1 : 1);
    else { this.sortKey.set(key); this.sortDirection.set(key === 'date' || key === 'value' || key === 'weight' ? -1 : 1); }
    this.page.set(1);
  }
  sortIndicator(key: SortKey): string { return this.sortKey() === key ? this.sortDirection() === 1 ? '↑' : '↓' : ''; }
  sortAria(key: SortKey): 'ascending' | 'descending' | 'none' {
    return this.sortKey() === key ? this.sortDirection() === 1 ? 'ascending' : 'descending' : 'none';
  }
  setMobileSort(value: string): void {
    const [key, direction] = value.split(':');
    this.sortKey.set(key as SortKey);
    this.sortDirection.set(direction === 'asc' ? 1 : -1);
    this.page.set(1);
  }

  openCreate(): void {
    const now = boliviaNow();
    this.editing.set(false);
    this.supplierId = '';
    this.operationDate = now.date;
    this.effectiveDate = now.date;
    this.effectiveTime = now.time;
    this.receiveNow = true;
    this.lines = [emptyLine()];
    this.editReason = '';
    this.editingId = null;
    this.editingVersion = null;
    this.editingConfirmed = false;
    this.formError.set('');
    this.pendingRequest = null;
    this.formOpen.set(true);
  }

  async openEdit(id: string): Promise<void> {
    if (this.busy()) return;
    let detail: PurchaseDetail;
    try { detail = await this.api.get<PurchaseDetail>(`/api/purchases/${id}`); }
    catch (error) { this.error.set(this.errorMessage(error)); return; }
    if (detail.summary.status === 'CANCELED') return;
    this.editingId = id;
    this.editing.set(true);
    this.supplierId = detail.summary.supplierId;
    this.operationDate = detail.summary.operationDate;
    this.receiveNow = detail.summary.status === 'CONFIRMED';
    this.editingConfirmed = detail.summary.status === 'CONFIRMED';
    this.editingVersion = detail.summary.version;
    this.lines = detail.lines.map(line => ({
      id: line.id, categoryCode: line.categoryCode, lengthCm: line.lengthCm,
      weight: line.agreedWeight, receivedWeight: line.receivedWeight, pricePerGram: line.pricePerGram,
    }));
    this.editReason = '';
    this.formError.set('');
    this.detail.set(null);
    this.formOpen.set(true);
  }

  addLine(): void { this.lines.push(emptyLine()); }
  removeLine(index: number): void { if (this.lines.length > 1) this.lines.splice(index, 1); }
  get draftTotal(): number {
    return sumMoney(this.lines.map(line => lineValue(Number(line.weight) || 0, Number(line.pricePerGram) || 0)));
  }

  async save(): Promise<void> {
    if (this.busy() || this.session.account()?.role !== 'ADMIN') return;
    this.formError.set('');
    if (!this.supplierId || !this.operationDate) { this.formError.set('Selecciona el proveedor y la fecha de compra.'); return; }
    if (!this.editing() && this.receiveNow && !this.effectiveAt(this.effectiveDate, this.effectiveTime)) {
      this.formError.set('Indica la fecha y hora reales de recepción.'); return;
    }
    if (this.editing() && !this.editReason.trim()) { this.formError.set('Indica el motivo de la edición.'); return; }
    const seen = new Set<string>();
    const lines = [];
    for (const line of this.lines) {
      const weight = Number(line.weight);
      const pricePerGram = Number(line.pricePerGram);
      if (!this.categories().some(category => category.code === line.categoryCode)
        || !this.lengths().some(length => length.centimeters === Number(line.lengthCm))
        || !Number.isFinite(weight) || weight <= 0 || !hasTwoDecimalPlaces(weight)
        || !Number.isFinite(pricePerGram) || pricePerGram <= 0 || !hasTwoDecimalPlaces(pricePerGram)) {
        this.formError.set('Cada cabello necesita calidad, longitud, peso y precio positivos con hasta dos decimales.'); return;
      }
      const key = `${line.categoryCode}:${line.lengthCm}`;
      if (seen.has(key)) { this.formError.set('Cada combinación de calidad y longitud debe aparecer una sola vez.'); return; }
      seen.add(key);
      lines.push({ id: line.id, categoryCode: line.categoryCode, lengthCm: Number(line.lengthCm), weight, pricePerGram });
    }
    this.busy.set(true);
    try {
      if (this.editing()) {
        const id = this.editingId;
        if (!id || this.editingVersion === null) throw new Error('Abre nuevamente la compra antes de editar.');
        const changed = await this.api.write<PurchaseDetail>('PUT', `/api/purchases/${id}`, {
          expectedVersion: this.editingVersion, supplierId: this.supplierId, operationDate: this.operationDate,
          lines, reason: this.editReason.trim(),
        });
        this.detail.set(changed);
      } else {
        const body = { supplierId: this.supplierId, operationDate: this.operationDate,
          lines: lines.map(({ categoryCode, lengthCm, weight, pricePerGram }) => ({ categoryCode, lengthCm, weight, pricePerGram })),
          receiveNow: this.receiveNow,
          effectiveAt: this.receiveNow ? this.effectiveAt(this.effectiveDate, this.effectiveTime) : null };
        const fingerprint = JSON.stringify(body);
        if (this.pendingRequest?.fingerprint !== fingerprint) this.pendingRequest = { fingerprint, key: crypto.randomUUID() };
        const created = await this.api.write<PurchaseDetail>('POST', '/api/purchases', {
          requestKey: this.pendingRequest.key, ...body,
        });
        this.detail.set(created);
        this.pendingRequest = null;
      }
      this.formOpen.set(false);
      this.editingId = null;
      this.message.set(this.editing() ? 'Compra actualizada.' : 'Compra registrada.');
      await this.refreshList();
    } catch (error) {
      this.formError.set(this.errorMessage(error));
    } finally { this.busy.set(false); }
  }

  private editingId: string | null = null;

  async openDetail(id: string): Promise<void> {
    if (this.busy()) return;
    this.detailError.set('');
    try {
      const detail = await this.api.get<PurchaseDetail>(`/api/purchases/${id}`);
      this.detail.set(detail);
      this.editingId = id;
      this.resetReceipt();
      this.resetPayment();
      this.showCancel = false;
    } catch (error) { this.error.set(this.errorMessage(error)); }
  }

  closeDetail(): void { this.detail.set(null); this.editingId = null; }
  fillRemaining(detail: PurchaseDetail): void {
    this.receiptWeights = Object.fromEntries(detail.lines.filter(line => line.remainingWeight > 0)
      .map(line => [line.id, line.remainingWeight]));
  }
  receiptTotal(receipt: PurchaseReceipt): number { return sumMoney(receipt.items.map(item => item.weight)); }
  receiptValue(receipt: PurchaseReceipt, lines: PurchaseLine[]): number {
    return sumMoney(receipt.items.map(item => lineValue(item.weight, lines.find(line => line.id === item.lineId)?.pricePerGram ?? 0)));
  }
  receiptItemLabel(detail: PurchaseDetail, lineId: string): string {
    const line = detail.lines.find(item => item.id === lineId);
    return line ? `${line.categoryName} · ${line.lengthCm} cm` : 'Tipo de cabello anterior';
  }
  resetReceipt(): void {
    const now = boliviaNow();
    this.receiptDate = now.date;
    this.receiptTime = now.time;
    this.receiptWeights = {};
    this.correctionReceiptId = null;
    this.correctionReason = '';
    this.pendingReceiptRequest = null;
    this.detailError.set('');
  }
  editReceipt(receipt: PurchaseReceipt, detail: PurchaseDetail): void {
    this.correctionReceiptId = receipt.id;
    const date = new Date(receipt.effectiveAt);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const value = (key: string) => parts.find(part => part.type === key)?.value ?? '';
    this.receiptDate = `${value('year')}-${value('month')}-${value('day')}`;
    this.receiptTime = `${value('hour')}:${value('minute')}`;
    this.receiptWeights = Object.fromEntries(receipt.items.map(item => [item.lineId, item.weight]));
    this.correctionReason = '';
    this.detailError.set('');
  }
  receiptLines(detail: PurchaseDetail): PurchaseLine[] {
    if (!this.correctionReceiptId) return detail.lines.filter(line => line.remainingWeight > 0);
    const receipt = detail.receipts.find(item => item.id === this.correctionReceiptId);
    return detail.lines.filter(line => receipt?.items.some(item => item.lineId === line.id));
  }
  async saveReceipt(): Promise<void> {
    const detail = this.detail();
    if (!detail || this.busy() || this.session.account()?.role !== 'ADMIN') return;
    const effectiveAt = this.effectiveAt(this.receiptDate, this.receiptTime);
    if (!effectiveAt) { this.detailError.set('Indica la fecha y hora reales de recepción.'); return; }
    const items = this.receiptLines(detail).map(line => ({ lineId: line.id, weight: Number(this.receiptWeights[line.id]) || 0 }));
    if (!this.correctionReceiptId) items.splice(0, items.length, ...items.filter(item => item.weight > 0));
    if (!items.length || items.some(item => item.weight <= 0 || !hasTwoDecimalPlaces(item.weight))) {
      this.detailError.set('Indica al menos un peso positivo con hasta dos decimales.'); return;
    }
    if (this.correctionReceiptId && !this.correctionReason.trim()) {
      this.detailError.set('Indica el motivo de la corrección.'); return;
    }
    this.busy.set(true);
    this.detailError.set('');
    try {
      const id = detail.summary.id;
      const body = { effectiveAt, items };
      const fingerprint = JSON.stringify({ id, body });
      if (!this.correctionReceiptId && this.pendingReceiptRequest?.fingerprint !== fingerprint) {
        this.pendingReceiptRequest = { fingerprint, key: crypto.randomUUID() };
      }
      const changed = this.correctionReceiptId
        ? await this.api.write<PurchaseDetail>('PUT', `/api/purchases/${id}/receipts/${this.correctionReceiptId}`,
          { expectedVersion: detail.summary.version, effectiveAt, items, reason: this.correctionReason.trim() })
        : await this.api.write<PurchaseDetail>('POST', `/api/purchases/${id}/receipts`,
          { requestKey: this.pendingReceiptRequest?.key, ...body });
      this.detail.set(changed);
      this.resetReceipt();
      await this.refreshList();
    } catch (error) { this.detailError.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async voidReceipt(): Promise<void> {
    const detail = this.detail();
    if (!detail || !this.correctionReceiptId || !this.correctionReason.trim() || this.busy()) {
      this.detailError.set('Indica el motivo para anular la recepción.'); return;
    }
    if (!confirm('¿Anular esta recepción? El inventario se recalculará y el movimiento permanecerá en el historial.')) return;
    await this.detailChange('POST', `/api/purchases/${detail.summary.id}/receipts/${this.correctionReceiptId}/void`,
      { expectedVersion: detail.summary.version, reason: this.correctionReason.trim() });
    if (!this.detailError()) this.resetReceipt();
  }

  editPayment(payment: PurchasePayment): void {
    this.paymentEditingId = payment.id;
    this.paymentDate = payment.paymentDate;
    this.paymentAmount = payment.amount;
    this.paymentMethod = payment.method;
    this.paymentReference = payment.reference ?? '';
    this.paymentReason = '';
    this.detailError.set('');
  }
  resetPayment(): void {
    this.paymentEditingId = null;
    this.paymentDate = boliviaNow().date;
    this.paymentAmount = null;
    this.paymentMethod = 'CASH';
    this.paymentReference = '';
    this.paymentReason = '';
    this.pendingPaymentRequest = null;
  }
  async savePayment(): Promise<void> {
    const detail = this.detail();
    const amount = Number(this.paymentAmount);
    if (!detail || !this.paymentDate || !Number.isFinite(amount) || amount <= 0 || !hasTwoDecimalPlaces(amount)) {
      this.detailError.set('Indica fecha e importe positivo con hasta dos decimales.'); return;
    }
    if (this.paymentEditingId && !this.paymentReason.trim()) {
      this.detailError.set('Indica el motivo de la corrección.'); return;
    }
    const id = detail.summary.id;
    const body = { paymentDate: this.paymentDate, amount, method: this.paymentMethod,
      reference: this.paymentReference.trim() };
    const fingerprint = JSON.stringify({ id, body });
    if (!this.paymentEditingId && this.pendingPaymentRequest?.fingerprint !== fingerprint) {
      this.pendingPaymentRequest = { fingerprint, key: crypto.randomUUID() };
    }
    await this.detailChange(this.paymentEditingId ? 'PUT' : 'POST',
      this.paymentEditingId ? `/api/purchases/${id}/payments/${this.paymentEditingId}` : `/api/purchases/${id}/payments`,
      { ...(this.paymentEditingId ? { expectedVersion: detail.summary.version, reason: this.paymentReason.trim() }
        : { requestKey: this.pendingPaymentRequest?.key }), ...body });
    if (!this.detailError()) this.resetPayment();
  }
  async voidPayment(): Promise<void> {
    const detail = this.detail();
    if (!detail || !this.paymentEditingId || !this.paymentReason.trim()) {
      this.detailError.set('Indica el motivo para anular el pago.'); return;
    }
    if (!confirm('¿Anular este pago? El saldo se recalculará y el movimiento permanecerá en el historial.')) return;
    await this.detailChange('POST', `/api/purchases/${detail.summary.id}/payments/${this.paymentEditingId}/void`,
      { expectedVersion: detail.summary.version, reason: this.paymentReason.trim() });
    if (!this.detailError()) this.resetPayment();
  }
  async cancelPurchase(): Promise<void> {
    const detail = this.detail();
    if (!detail || !this.cancelReason.trim()) { this.detailError.set('Indica el motivo de anulación.'); return; }
    if (!confirm('¿Anular el saldo pendiente de esta compra? Las recepciones ya registradas se conservarán.')) return;
    await this.detailChange('POST', `/api/purchases/${detail.summary.id}/cancel`, { reason: this.cancelReason.trim() });
    if (!this.detailError()) { this.showCancel = false; this.cancelReason = ''; }
  }
  private async detailChange(method: 'POST' | 'PUT', path: `/api/${string}`, body: unknown): Promise<void> {
    if (this.busy() || this.session.account()?.role !== 'ADMIN') return;
    this.busy.set(true);
    this.detailError.set('');
    try {
      this.detail.set(await this.api.write<PurchaseDetail>(method, path, body));
      await this.refreshList();
    } catch (error) { this.detailError.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  private async refreshList(): Promise<void> {
    try {
      this.purchases.set(await this.api.get<PurchaseSummary[]>('/api/purchases'));
      if (this.page() > this.pageCount()) this.page.set(this.pageCount());
    }
    catch (error) { this.error.set(this.errorMessage(error)); }
  }
  private effectiveAt(date: string, time: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
    return `${date}T${time}:00-04:00`;
  }
  statusLabel(status: PurchaseStatus): string {
    return status === 'CONFIRMED' ? 'Confirmado' : status === 'PENDING' ? 'Pendiente' : 'Anulada';
  }
  paymentLabel(method: PaymentMethod): string {
    return { CASH: 'Efectivo', QR: 'QR', TRANSFER: 'Transferencia', OTHER: 'Otro' }[method];
  }
  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return error instanceof Error ? error.message : 'No se pudo completar la operación. Inténtalo nuevamente.';
    if (error.status === 0) return 'No se pudo conectar con la API. Comprueba que Spring Boot esté funcionando.';
    if (error.status === 401) { void this.session.restore(); return 'La sesión venció. Ingresa nuevamente.'; }
    if (error.status === 403) return 'No tienes permiso para realizar esta acción.';
    return typeof error.error?.error === 'string' ? error.error.error : 'El servidor no pudo completar la operación.';
  }
}
