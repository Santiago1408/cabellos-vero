import { DatePipe, JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../data/api-client';
import { DebtDetail, DebtPayment, DebtSummary } from '../../data/debt-api';
import { hasTwoDecimalPlaces } from '../../data/money';
import { Icon } from '../../shared/icon/icon';

type SortKey = 'party' | 'kind' | 'total' | 'paid' | 'balance' | 'dueOn' | 'status';
type DebtDraft = { party: string; phone: string; kind: 'RECEIVABLE' | 'PAYABLE'; total: number | null; openedOn: string; dueOn: string; notes: string; reason: string };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const empty = (): DebtDraft => ({ party: '', phone: '', kind: 'RECEIVABLE', total: null, openedOn: today(), dueOn: today(), notes: '', reason: '' });

@Component({
  selector: 'app-connected-debts', standalone: true,
  imports: [FormsModule, DatePipe, JsonPipe, Icon],
  templateUrl: './connected-debts.html',
  styleUrls: ['./connected-debts.css', '../debts/debts.css', '../../shared/operation.css'],
})
export class ConnectedDebts implements OnInit {
  private readonly api = inject(ApiClient);
  readonly rows = signal<DebtSummary[]>([]);
  readonly detail = signal<DebtDetail | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly detailError = signal('');
  readonly message = signal('');
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly kindFilter = signal('');
  readonly statusFilter = signal('');
  readonly sortKey = signal<SortKey>('dueOn');
  readonly direction = signal<1 | -1>(1);
  readonly page = signal(1);
  readonly filtered = computed(() => this.rows().filter(row => (!this.kindFilter() || row.kind === this.kindFilter()) && (!this.statusFilter() || row.status === this.statusFilter())).sort((a, b) => {
    const key = this.sortKey(); const left = a[key], right = b[key];
    const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'es-BO', { numeric: true });
    return this.direction() * (comparison || a.party.localeCompare(b.party, 'es-BO'));
  }));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 7)));
  readonly pageItems = computed(() => this.filtered().slice((this.page() - 1) * 7, this.page() * 7));
  readonly receivable = computed(() => this.rows().filter(row => row.kind === 'RECEIVABLE').reduce((sum, row) => sum + row.balance, 0));
  readonly payable = computed(() => this.rows().filter(row => row.kind === 'PAYABLE').reduce((sum, row) => sum + row.balance, 0));
  readonly overdue = computed(() => this.rows().filter(row => row.status === 'OVERDUE').length);
  readonly paid = computed(() => this.rows().filter(row => row.status === 'PAID').length);
  draft = empty();
  payment: { id: string | null; paidOn: string; amount: number | null; note: string; reason: string; requestKey: string } = { id: null, paidOn: today(), amount: null, note: '', reason: '', requestKey: crypto.randomUUID() };
  readonly paymentOpen = signal(false);
  readonly voidingPayment = signal<string | null>(null);
  voidReason = '';
  private createKey = crypto.randomUUID();
  private editingVersion: number | null = null;
  private editingPaid = 0;

  ngOnInit(): void { void this.load(); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.rows.set(await this.api.get<DebtSummary[]>('/api/debts')); }
    catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.loading.set(false); }
  }
  sortBy(key: SortKey): void { if (this.sortKey() === key) this.direction.update(value => value === 1 ? -1 : 1); else { this.sortKey.set(key); this.direction.set(1); } this.page.set(1); }
  sortIndicator(key: SortKey): string { return this.sortKey() === key ? this.direction() === 1 ? '↑' : '↓' : ''; }
  sortAria(key: SortKey): 'ascending' | 'descending' | 'none' { return this.sortKey() === key ? this.direction() === 1 ? 'ascending' : 'descending' : 'none'; }
  setMobileSort(value: string): void { const [key, direction] = value.split(':'); this.sortKey.set(key as SortKey); this.direction.set(direction === 'desc' ? -1 : 1); this.page.set(1); }
  statusLabel(status: DebtSummary['status']): string { return { PAID: 'Pagada', OVERDUE: 'Vencida', PARTIAL: 'Parcial', PENDING: 'Pendiente' }[status]; }
  kindLabel(kind: DebtSummary['kind']): string { return kind === 'RECEIVABLE' ? 'Por cobrar' : 'Por pagar'; }
  money(value: number): string { return `${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} Bs.`; }

  openCreate(): void { this.draft = empty(); this.createKey = crypto.randomUUID(); this.editingId.set(null); this.editingVersion = null; this.editingPaid = 0; this.formError.set(''); this.formOpen.set(true); }
  openEdit(row: DebtSummary): void { this.draft = { party: row.party, phone: row.phone, kind: row.kind, total: row.total, openedOn: row.openedOn, dueOn: row.dueOn, notes: row.notes, reason: '' }; this.editingId.set(row.id); this.editingVersion = row.version; this.editingPaid = row.paid; this.formError.set(''); this.formOpen.set(true); this.detail.set(null); }
  async save(): Promise<void> {
    if (this.busy()) return;
    const d = this.draft;
    if (!d.party.trim() || !d.phone.trim() || !d.openedOn || !d.dueOn) { this.formError.set('Completa nombre, teléfono y fechas.'); return; }
    if (d.total === null || d.total <= 0 || !hasTwoDecimalPlaces(d.total)) { this.formError.set('El importe debe ser positivo y tener como máximo dos decimales.'); return; }
    if (d.dueOn < d.openedOn) { this.formError.set('El vencimiento no puede ser anterior a la fecha de registro.'); return; }
    if (this.editingId() && !d.reason.trim()) { this.formError.set('Explica el motivo de la edición.'); return; }
    if (d.total < this.editingPaid) { this.formError.set('El importe no puede ser menor que los abonos registrados.'); return; }
    this.busy.set(true); this.formError.set('');
    try {
      const body = { party: d.party.trim(), phone: d.phone.trim(), kind: d.kind, total: d.total, openedOn: d.openedOn, dueOn: d.dueOn, notes: d.notes.trim() };
      const id = this.editingId();
      const result = id
        ? await this.api.write<DebtDetail>('PUT', `/api/debts/${id}`, { ...body, expectedVersion: this.editingVersion, reason: d.reason.trim() })
        : await this.api.write<DebtDetail>('POST', '/api/debts', { ...body, requestKey: this.createKey });
      this.formOpen.set(false); this.detail.set(result); await this.load(); this.message.set(id ? 'Deuda actualizada.' : 'Deuda registrada.');
    } catch (error) { this.formError.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async openDetail(id: string): Promise<void> {
    this.detailError.set(''); this.paymentOpen.set(false);
    try { this.detail.set(await this.api.get<DebtDetail>(`/api/debts/${id}`)); }
    catch (error) { this.error.set(this.errorMessage(error)); }
  }
  openPayment(payment?: DebtPayment): void {
    this.payment = { id: payment?.id ?? null, paidOn: payment?.paidOn ?? today(), amount: payment?.amount ?? null, note: payment?.note ?? '', reason: '', requestKey: crypto.randomUUID() };
    this.detailError.set(''); this.paymentOpen.set(true);
  }
  async savePayment(): Promise<void> {
    const debt = this.detail()?.debt; if (!debt || this.busy()) return;
    const p = this.payment;
    if (!p.paidOn || p.amount === null || p.amount <= 0 || !hasTwoDecimalPlaces(p.amount)) { this.detailError.set('Indica una fecha y un importe positivo con máximo dos decimales.'); return; }
    if (p.id && !p.reason.trim()) { this.detailError.set('Explica el motivo de la corrección.'); return; }
    this.busy.set(true); this.detailError.set('');
    try {
      const result = p.id
        ? await this.api.write<DebtDetail>('PUT', `/api/debts/${debt.id}/payments/${p.id}`, { expectedVersion: debt.version, paidOn: p.paidOn, amount: p.amount, note: p.note, reason: p.reason.trim() })
        : await this.api.write<DebtDetail>('POST', `/api/debts/${debt.id}/payments`, { requestKey: p.requestKey, paidOn: p.paidOn, amount: p.amount, note: p.note });
      this.detail.set(result); this.paymentOpen.set(false); await this.load(); this.message.set(p.id ? 'Abono corregido.' : 'Abono registrado.');
    } catch (error) { this.detailError.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async voidPayment(): Promise<void> {
    const debt = this.detail()?.debt, paymentId = this.voidingPayment();
    if (!debt || !paymentId || this.busy()) return;
    if (!this.voidReason.trim()) { this.detailError.set('Explica el motivo de la anulación.'); return; }
    this.busy.set(true); this.detailError.set('');
    try {
      this.detail.set(await this.api.write<DebtDetail>('POST', `/api/debts/${debt.id}/payments/${paymentId}/void`, { expectedVersion: debt.version, reason: this.voidReason.trim() }));
      this.voidingPayment.set(null); this.voidReason = ''; await this.load(); this.message.set('Abono anulado.');
    } catch (error) { this.detailError.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  private errorMessage(error: unknown): string { return error instanceof HttpErrorResponse && typeof error.error?.error === 'string' ? error.error.error : 'No se pudo completar la operación. Inténtalo nuevamente.'; }
}
