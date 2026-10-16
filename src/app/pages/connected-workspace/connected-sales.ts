import { DatePipe, DecimalPipe, JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../data/api-client';
import { AuthSession } from '../../data/auth-session';
import { hasTwoDecimalPlaces, lineValue, sumMoney } from '../../data/money';
import {
  SaleApiError, SaleAvailabilityIssue, SaleDelivery, SaleDetail, SaleLine,
  SalePayment, SaleStatus, SaleSummary,
} from '../../data/sale-api';
import { Icon } from '../../shared/icon/icon';

type Category = { code: string; displayName: string };
type Length = { centimeters: number };
type SortKey = 'customer' | 'value' | 'weight' | 'date' | 'status';
type LineDraft = {
  id?: string; categoryCode: string; lengthCm: number | null;
  weight: number | null; finalWeight: number | null;
  deliveredWeight?: number; pricePerGram: number | null;
};
type PaymentMethod = SalePayment['method'];

const emptyLine = (): LineDraft => ({ categoryCode: '', lengthCm: null, weight: null,
  finalWeight: null, pricePerGram: null });
const boliviaNow = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (part: string) => parts.find(item => item.type === part)?.value ?? '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
};
const dateTimeInput = (instant: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const value = (part: string) => parts.find(item => item.type === part)?.value ?? '';
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` };
};

@Component({
  selector: 'app-connected-sales',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, JsonPipe, Icon],
  templateUrl: './connected-sales.html',
  styleUrls: ['./connected-sales.css', '../../shared/operation.css'],
})
export class ConnectedSales implements OnInit {
  private readonly api = inject(ApiClient);
  readonly session = inject(AuthSession);
  readonly sales = signal<SaleSummary[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly lengths = signal<Length[]>([]);
  readonly detail = signal<SaleDetail | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly detailError = signal('');
  readonly message = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal(false);
  readonly pendingIssues = signal<SaleAvailabilityIssue[]>([]);
  readonly shortageIssues = signal<SaleAvailabilityIssue[]>([]);
  readonly statusFilter = signal('');
  readonly sortKey = signal<SortKey>('date');
  readonly sortDirection = signal<1 | -1>(-1);
  readonly page = signal(1);
  readonly filtered = computed(() => {
    const filter = this.statusFilter();
    const key = this.sortKey();
    const direction = this.sortDirection();
    return this.sales().filter(row => !filter || row.status === filter).sort((left, right) => {
      const a: string | number = key === 'customer' ? left.customerName : key === 'value' ? left.agreedTotal
        : key === 'weight' ? left.agreedWeight : key === 'date' ? left.operationDate : left.status;
      const b: string | number = key === 'customer' ? right.customerName : key === 'value' ? right.agreedTotal
        : key === 'weight' ? right.agreedWeight : key === 'date' ? right.operationDate : right.status;
      const comparison = typeof a === 'number' && typeof b === 'number' ? a - b
        : String(a).localeCompare(String(b), 'es-BO', { numeric: true, sensitivity: 'base' });
      return direction * (comparison || left.createdAt.localeCompare(right.createdAt));
    });
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 7)));
  readonly pageItems = computed(() => this.filtered().slice((this.page() - 1) * 7, this.page() * 7));
  readonly lineValue = lineValue;

  customerName = '';
  operationDate = boliviaNow().date;
  saleMode: 'immediate' | 'reservation' = 'immediate';
  effectiveDate = boliviaNow().date;
  effectiveTime = boliviaNow().time;
  acceptedPendingStock = false;
  lines: LineDraft[] = [emptyLine()];
  editReason = '';
  editingConfirmed = false;
  private editingId: string | null = null;
  private editingVersion: number | null = null;
  private pendingFingerprint: string | null = null;
  private pendingRequest: { fingerprint: string; key: string } | null = null;

  deliveryDate = boliviaNow().date;
  deliveryTime = boliviaNow().time;
  deliveryWeights: Record<string, number | null> = {};
  deliveryFinalWeights: Record<string, number | null> = {};
  correctionDeliveryId: string | null = null;
  correctionReason = '';
  private pendingDeliveryRequest: { fingerprint: string; key: string } | null = null;

  paymentEditingId: string | null = null;
  paymentDate = boliviaNow().date;
  paymentAmount: number | null = null;
  paymentMethod: PaymentMethod = 'CASH';
  paymentReference = '';
  paymentReason = '';
  private pendingPaymentRequest: { fingerprint: string; key: string } | null = null;
  showCancel = false;
  cancelReason = '';

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [sales, categories, lengths] = await Promise.all([
        this.api.get<SaleSummary[]>('/api/sales'),
        this.api.get<Category[]>('/api/catalog/categories'),
        this.api.get<Length[]>('/api/catalog/lengths'),
      ]);
      this.sales.set(sales);
      this.categories.set(categories);
      this.lengths.set(lengths);
    } catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.loading.set(false); }
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
  dateLabel(value: string): string {
    const [year, month, day] = value.split('T')[0].split('-');
    return day && month && year ? `${day}/${month}/${year}` : value;
  }
  statusLabel(status: SaleStatus): string {
    return status === 'CONFIRMED' ? 'Confirmada' : status === 'PENDING' ? 'Pendiente' : 'Anulada';
  }
  paymentLabel(method: PaymentMethod): string {
    return { CASH: 'Efectivo', QR: 'QR', TRANSFER: 'Transferencia', OTHER: 'Otro' }[method];
  }
  categoryLabel(code: string): string {
    return this.categories().find(category => category.code === code)?.displayName ?? code;
  }
  lastEdit(detail: SaleDetail): string | null {
    return detail.history.filter(change => change.eventType === 'SALE_UPDATED')
      .reduce<string | null>((latest, change) => !latest || change.changedAt > latest ? change.changedAt : latest, null);
  }

  openCreate(): void {
    const now = boliviaNow();
    this.editing.set(false);
    this.editingId = null;
    this.editingVersion = null;
    this.editingConfirmed = false;
    this.customerName = '';
    this.operationDate = now.date;
    this.effectiveDate = now.date;
    this.effectiveTime = now.time;
    this.saleMode = 'immediate';
    this.acceptedPendingStock = false;
    this.lines = [emptyLine()];
    this.editReason = '';
    this.pendingRequest = null;
    this.clearAvailability();
    this.formError.set('');
    this.formOpen.set(true);
  }

  async openEdit(id: string): Promise<void> {
    if (this.busy()) return;
    let detail: SaleDetail;
    try { detail = await this.api.get<SaleDetail>(`/api/sales/${id}`); }
    catch (error) { this.error.set(this.errorMessage(error)); return; }
    if (detail.summary.status === 'CANCELED') return;
    this.editing.set(true);
    this.editingId = id;
    this.editingVersion = detail.summary.version;
    this.editingConfirmed = detail.summary.status === 'CONFIRMED';
    this.customerName = detail.summary.customerName;
    this.operationDate = detail.summary.operationDate;
    this.saleMode = detail.summary.status === 'CONFIRMED' ? 'immediate' : 'reservation';
    this.acceptedPendingStock = detail.summary.acceptedPendingStock;
    this.lines = detail.lines.map(line => ({
      id: line.id, categoryCode: line.categoryCode, lengthCm: line.lengthCm,
      weight: line.agreedWeight, finalWeight: line.finalWeight,
      deliveredWeight: line.deliveredWeight,
      pricePerGram: line.pricePerGram,
    }));
    this.editReason = '';
    this.clearAvailability(false);
    this.formError.set('');
    this.detail.set(null);
    this.formOpen.set(true);
  }

  addLine(): void { this.lines.push(emptyLine()); this.clearAvailability(); }
  removeLine(index: number): void { if (this.lines.length > 1) { this.lines.splice(index, 1); this.clearAvailability(); } }
  get draftTotal(): number {
    return sumMoney(this.lines.map(line => lineValue(Number(line.finalWeight) || 0,
      Number(line.pricePerGram) || 0)));
  }
  clearAvailability(resetAcceptance = true): void {
    this.pendingIssues.set([]);
    this.shortageIssues.set([]);
    this.pendingFingerprint = null;
    if (resetAcceptance) this.acceptedPendingStock = false;
    this.formError.set('');
  }
  private draftLines(): { id?: string; categoryCode: string; lengthCm: number;
    weight: number; finalWeight: number; pricePerGram: number }[] | null {
    const used = new Set<string>();
    const lines = [];
    for (const line of this.lines) {
      const weight = Number(line.weight);
      const finalWeight = Number(line.finalWeight);
      const pricePerGram = Number(line.pricePerGram);
      if (!this.categories().some(category => category.code === line.categoryCode)
        || !this.lengths().some(length => length.centimeters === Number(line.lengthCm))
        || !Number.isFinite(weight) || weight <= 0 || !hasTwoDecimalPlaces(weight)
        || !Number.isFinite(finalWeight) || finalWeight < weight || !hasTwoDecimalPlaces(finalWeight)
        || !Number.isFinite(pricePerGram) || pricePerGram <= 0 || !hasTwoDecimalPlaces(pricePerGram)) {
        this.formError.set('Cada cabello necesita tipo, peso de cabello, peso final con ligas y precio con hasta dos decimales. El peso final debe ser igual o mayor que el cabello.');
        return null;
      }
      const key = `${line.categoryCode}:${line.lengthCm}`;
      if (used.has(key)) { this.formError.set('Cada combinación de calidad y longitud debe aparecer una sola vez.'); return null; }
      used.add(key);
      lines.push({ id: line.id, categoryCode: line.categoryCode,
        lengthCm: Number(line.lengthCm), weight, finalWeight, pricePerGram });
    }
    return lines;
  }
  private draftFingerprint(): string {
    return JSON.stringify({ id: this.editingId, customerName: this.customerName.trim(),
      operationDate: this.operationDate, lines: this.lines.map(line => ({ ...line })),
      effectiveDate: this.saleMode === 'immediate' ? this.effectiveDate : null,
      effectiveTime: this.saleMode === 'immediate' ? this.effectiveTime : null });
  }

  async acceptPending(): Promise<void> {
    if (!this.pendingIssues().length || this.pendingFingerprint !== this.draftFingerprint()) {
      this.clearAvailability();
      this.formError.set('Los datos cambiaron. Guarda nuevamente para comprobar la disponibilidad actual.');
      return;
    }
    this.saleMode = 'reservation';
    this.acceptedPendingStock = true;
    this.pendingIssues.set([]);
    this.pendingFingerprint = null;
    await this.save();
  }

  async save(): Promise<void> {
    if (this.busy() || this.session.account()?.role !== 'ADMIN') return;
    this.formError.set('');
    this.shortageIssues.set([]);
    if (!this.customerName.trim() || !this.operationDate) {
      this.formError.set('Indica el cliente y la fecha de venta.'); return;
    }
    if (this.editing() && !this.editReason.trim()) {
      this.formError.set('Indica el motivo de la edición.'); return;
    }
    const lines = this.draftLines();
    if (!lines) return;
    const effectiveAt = this.effectiveAt(this.effectiveDate, this.effectiveTime);
    if (!this.editing() && this.saleMode === 'immediate' && !effectiveAt) {
      this.formError.set('Indica la fecha y hora reales de entrega.'); return;
    }
    this.busy.set(true);
    try {
      let changed: SaleDetail;
      if (this.editing()) {
        if (!this.editingId || this.editingVersion === null) throw new Error('Abre nuevamente la venta antes de editar.');
        changed = await this.api.write<SaleDetail>('PUT', `/api/sales/${this.editingId}`, {
          expectedVersion: this.editingVersion, customerName: this.customerName.trim(),
          operationDate: this.operationDate, lines, acceptPendingStock: this.acceptedPendingStock,
          reason: this.editReason.trim(),
        });
      } else {
        const body = { customerName: this.customerName.trim(), operationDate: this.operationDate,
          lines: lines.map(({ categoryCode, lengthCm, weight, finalWeight, pricePerGram }) =>
            ({ categoryCode, lengthCm, weight, finalWeight, pricePerGram })),
          ...(this.saleMode === 'immediate' ? { effectiveAt }
            : { acceptPendingStock: this.acceptedPendingStock }) };
        const path = this.saleMode === 'immediate' ? '/api/sales' : '/api/sales/reservations';
        const fingerprint = JSON.stringify({ path, body });
        if (this.pendingRequest?.fingerprint !== fingerprint) this.pendingRequest = { fingerprint, key: crypto.randomUUID() };
        changed = await this.api.write<SaleDetail>('POST', path, { requestKey: this.pendingRequest.key, ...body });
        this.pendingRequest = null;
      }
      this.detail.set(changed);
      this.formOpen.set(false);
      this.editingId = null;
      this.clearAvailability();
      this.message.set(this.editing() ? 'Venta actualizada.' : 'Venta registrada.');
      await this.refreshList();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.error?.code === 'PENDING_STOCK_CONFIRMATION_REQUIRED') {
        const apiError = error.error as SaleApiError;
        this.pendingIssues.set(apiError.details ?? []);
        this.pendingFingerprint = this.draftFingerprint();
        this.formError.set(apiError.error);
      } else if (error instanceof HttpErrorResponse && error.error?.code === 'INSUFFICIENT_HAIR') {
        const apiError = error.error as SaleApiError;
        this.pendingIssues.set([]);
        this.shortageIssues.set(apiError.details ?? []);
        this.formError.set(apiError.error);
      } else {
        this.formError.set(this.errorMessage(error));
      }
    } finally { this.busy.set(false); }
  }

  async openDetail(id: string): Promise<void> {
    if (this.busy()) return;
    this.detailError.set('');
    try {
      this.detail.set(await this.api.get<SaleDetail>(`/api/sales/${id}`));
      this.resetDelivery();
      this.resetPayment();
      this.showCancel = false;
    } catch (error) { this.error.set(this.errorMessage(error)); }
  }
  closeDetail(): void { this.detail.set(null); }

  deliveryTotal(delivery: SaleDelivery): number { return sumMoney(delivery.items.map(item => item.weight)); }
  deliveryValue(delivery: SaleDelivery, lines: SaleLine[]): number {
    return sumMoney(delivery.items.map(item => lineValue(item.finalWeight,
      lines.find(line => line.id === item.lineId)?.pricePerGram ?? 0)));
  }
  deliveryItemLabel(detail: SaleDetail, lineId: string): string {
    const line = detail.lines.find(item => item.id === lineId);
    return line ? `${line.categoryName} · ${line.lengthCm} cm` : 'Tipo de cabello anterior';
  }
  deliveryLines(detail: SaleDetail): SaleLine[] {
    if (!this.correctionDeliveryId) return detail.lines.filter(line => line.remainingWeight > 0);
    const delivery = detail.deliveries.find(item => item.id === this.correctionDeliveryId);
    return detail.lines.filter(line => delivery?.items.some(item => item.lineId === line.id));
  }
  fillRemaining(detail: SaleDetail): void {
    this.deliveryWeights = Object.fromEntries(detail.lines.filter(line => line.remainingWeight > 0)
      .map(line => [line.id, line.remainingWeight]));
    this.deliveryFinalWeights = Object.fromEntries(detail.lines.filter(line => line.remainingWeight > 0)
      .map(line => [line.id, line.remainingFinalWeight]));
  }
  resetDelivery(): void {
    const now = boliviaNow();
    this.deliveryDate = now.date;
    this.deliveryTime = now.time;
    this.deliveryWeights = {};
    this.deliveryFinalWeights = {};
    this.correctionDeliveryId = null;
    this.correctionReason = '';
    this.pendingDeliveryRequest = null;
    this.detailError.set('');
  }
  editDelivery(delivery: SaleDelivery): void {
    const at = dateTimeInput(delivery.effectiveAt);
    this.correctionDeliveryId = delivery.id;
    this.deliveryDate = at.date;
    this.deliveryTime = at.time;
    this.deliveryWeights = Object.fromEntries(delivery.items.map(item => [item.lineId, item.weight]));
    this.deliveryFinalWeights = Object.fromEntries(delivery.items.map(item =>
      [item.lineId, item.finalWeight]));
    this.correctionReason = '';
    this.detailError.set('');
  }
  async saveDelivery(): Promise<void> {
    const detail = this.detail();
    if (!detail || this.busy() || this.session.account()?.role !== 'ADMIN') return;
    const effectiveAt = this.effectiveAt(this.deliveryDate, this.deliveryTime);
    if (!effectiveAt) { this.detailError.set('Indica la fecha y hora reales de entrega.'); return; }
    const items = this.deliveryLines(detail).map(line =>
      ({ lineId: line.id, weight: Number(this.deliveryWeights[line.id]) || 0,
        finalWeight: Number(this.deliveryFinalWeights[line.id]) || 0 }));
    if (!this.correctionDeliveryId) items.splice(0, items.length, ...items.filter(item => item.weight > 0));
    if (!items.length || items.some(item => item.weight <= 0 || !hasTwoDecimalPlaces(item.weight)
      || item.finalWeight < item.weight || !hasTwoDecimalPlaces(item.finalWeight))) {
      this.detailError.set('Indica peso de cabello y peso final con ligas para cada entrega. El peso final debe ser igual o mayor.'); return;
    }
    if (this.correctionDeliveryId && !this.correctionReason.trim()) {
      this.detailError.set('Indica el motivo de la corrección.'); return;
    }
    this.busy.set(true);
    this.detailError.set('');
    try {
      const id = detail.summary.id;
      const body = { effectiveAt, items };
      const fingerprint = JSON.stringify({ id, body });
      if (!this.correctionDeliveryId && this.pendingDeliveryRequest?.fingerprint !== fingerprint) {
        this.pendingDeliveryRequest = { fingerprint, key: crypto.randomUUID() };
      }
      const changed = this.correctionDeliveryId
        ? await this.api.write<SaleDetail>('PUT', `/api/sales/${id}/deliveries/${this.correctionDeliveryId}`,
          { expectedVersion: detail.summary.version, ...body, reason: this.correctionReason.trim() })
        : await this.api.write<SaleDetail>('POST', `/api/sales/${id}/deliveries`,
          { requestKey: this.pendingDeliveryRequest?.key, ...body });
      this.detail.set(changed);
      this.resetDelivery();
      await this.refreshList();
    } catch (error) { this.detailError.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async voidDelivery(): Promise<void> {
    const detail = this.detail();
    if (!detail || !this.correctionDeliveryId || !this.correctionReason.trim() || this.busy()) {
      this.detailError.set('Indica el motivo para anular la entrega.'); return;
    }
    if (!confirm('¿Anular esta entrega? El inventario se recalculará y el movimiento permanecerá en el historial.')) return;
    await this.detailChange('POST', `/api/sales/${detail.summary.id}/deliveries/${this.correctionDeliveryId}/void`,
      { expectedVersion: detail.summary.version, reason: this.correctionReason.trim() });
    if (!this.detailError()) this.resetDelivery();
  }

  editPayment(payment: SalePayment): void {
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
      this.paymentEditingId ? `/api/sales/${id}/payments/${this.paymentEditingId}` : `/api/sales/${id}/payments`,
      { ...(this.paymentEditingId ? { expectedVersion: detail.summary.version, reason: this.paymentReason.trim() }
        : { requestKey: this.pendingPaymentRequest?.key }), ...body });
    if (!this.detailError()) this.resetPayment();
  }
  async voidPayment(): Promise<void> {
    const detail = this.detail();
    if (!detail || !this.paymentEditingId || !this.paymentReason.trim()) {
      this.detailError.set('Indica el motivo para anular el cobro.'); return;
    }
    if (!confirm('¿Anular este cobro? El saldo se recalculará y el movimiento permanecerá en el historial.')) return;
    await this.detailChange('POST', `/api/sales/${detail.summary.id}/payments/${this.paymentEditingId}/void`,
      { expectedVersion: detail.summary.version, reason: this.paymentReason.trim() });
    if (!this.detailError()) this.resetPayment();
  }
  async cancelSale(): Promise<void> {
    const detail = this.detail();
    if (!detail || !this.cancelReason.trim()) { this.detailError.set('Indica el motivo de anulación.'); return; }
    if (!confirm('¿Anular el saldo pendiente de esta venta? Las entregas ya registradas se conservarán.')) return;
    await this.detailChange('POST', `/api/sales/${detail.summary.id}/cancel`, { reason: this.cancelReason.trim() });
    if (!this.detailError()) { this.showCancel = false; this.cancelReason = ''; }
  }
  private async detailChange(method: 'POST' | 'PUT', path: `/api/${string}`, body: unknown): Promise<void> {
    if (this.busy() || this.session.account()?.role !== 'ADMIN') return;
    this.busy.set(true);
    this.detailError.set('');
    try {
      this.detail.set(await this.api.write<SaleDetail>(method, path, body));
      await this.refreshList();
    } catch (error) { this.detailError.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  private async refreshList(): Promise<void> {
    try {
      this.sales.set(await this.api.get<SaleSummary[]>('/api/sales'));
      if (this.page() > this.pageCount()) this.page.set(this.pageCount());
    } catch (error) { this.error.set(this.errorMessage(error)); }
  }
  private effectiveAt(date: string, time: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
    return `${date}T${time}:00-04:00`;
  }
  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return error instanceof Error
      ? error.message : 'No se pudo completar la operación. Inténtalo nuevamente.';
    if (error.status === 0) return 'No se pudo conectar con la API. Comprueba que Spring Boot esté funcionando.';
    if (error.status === 401) { void this.session.restore(); return 'La sesión venció. Ingresa nuevamente.'; }
    if (error.status === 403) return typeof error.error?.error === 'string'
      ? error.error.error : 'No se pudo autorizar la venta. Recarga la página e inicia sesión de nuevo.';
    return typeof error.error?.error === 'string' ? error.error.error : 'El servidor no pudo completar la operación.';
  }
}
