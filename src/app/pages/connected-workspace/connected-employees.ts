import { DatePipe, JsonPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../data/api-client';
import { EmployeeDetail, EmployeeSummary, TemporaryPassword } from '../../data/employee-api';
import { Icon } from '../../shared/icon/icon';

type SortKey = 'fullName' | 'username' | 'ci' | 'phone' | 'status';
type Draft = { username: string; fullName: string; ci: string; birthDate: string; phone: string; reason: string };
const empty = (): Draft => ({ username: '', fullName: '', ci: '', birthDate: '', phone: '', reason: '' });

@Component({
  selector: 'app-connected-employees', standalone: true,
  imports: [FormsModule, DatePipe, JsonPipe, Icon],
  templateUrl: './connected-employees.html',
  styleUrls: ['./connected-employees.css', '../employees/employees.css', '../../shared/operation.css'],
})
export class ConnectedEmployees implements OnInit {
  private readonly api = inject(ApiClient);
  readonly rows = signal<EmployeeSummary[]>([]);
  readonly detail = signal<EmployeeDetail | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly formError = signal('');
  readonly detailError = signal('');
  readonly message = signal('');
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly temporaryPassword = signal<string | null>(null);
  readonly action = signal<'deactivate' | 'reactivate' | 'reset' | null>(null);
  readonly search = signal('');
  readonly statusFilter = signal('all');
  readonly sortKey = signal<SortKey>('fullName');
  readonly direction = signal<1 | -1>(1);
  readonly page = signal(1);
  readonly filtered = computed(() => this.rows().filter(row => {
    const query = this.search().trim().toLocaleLowerCase('es-BO');
    return (!query || [row.fullName, row.username, row.ci, row.phone].some(value => value.toLocaleLowerCase('es-BO').includes(query)))
      && (this.statusFilter() === 'all' || row.active === (this.statusFilter() === 'active'));
  }).sort((a, b) => {
    const key = this.sortKey();
    const left = key === 'status' ? Number(a.active) : a[key];
    const right = key === 'status' ? Number(b.active) : b[key];
    return this.direction() * (typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'es-BO'));
  }));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 7)));
  readonly pageItems = computed(() => this.filtered().slice((this.page() - 1) * 7, this.page() * 7));
  draft = empty();
  actionReason = '';

  ngOnInit(): void { void this.load(); }
  async load(): Promise<void> { this.loading.set(true); this.error.set(''); try { this.rows.set(await this.api.get<EmployeeSummary[]>('/api/employees')); } catch (error) { this.error.set(this.errorMessage(error)); } finally { this.loading.set(false); } }
  sortBy(key: SortKey): void { if (this.sortKey() === key) this.direction.update(value => value === 1 ? -1 : 1); else { this.sortKey.set(key); this.direction.set(1); } this.page.set(1); }
  sortIndicator(key: SortKey): string { return this.sortKey() === key ? this.direction() === 1 ? '↑' : '↓' : ''; }
  sortAria(key: SortKey): 'ascending' | 'descending' | 'none' { return this.sortKey() === key ? this.direction() === 1 ? 'ascending' : 'descending' : 'none'; }
  setMobileSort(value: string): void { const [key, direction] = value.split(':'); this.sortKey.set(key as SortKey); this.direction.set(direction === 'desc' ? -1 : 1); this.page.set(1); }
  openCreate(): void { this.draft = empty(); this.editingId.set(null); this.formError.set(''); this.formOpen.set(true); }
  openEdit(row: EmployeeSummary): void { this.draft = { username: row.username, fullName: row.fullName, ci: row.ci, birthDate: row.birthDate, phone: row.phone, reason: '' }; this.editingId.set(row.id); this.formError.set(''); this.formOpen.set(true); this.detail.set(null); }
  async save(): Promise<void> {
    if (this.busy()) return;
    const d = this.draft;
    if (!d.username.trim() || !d.fullName.trim() || !d.ci.trim() || !d.birthDate || !d.phone.trim()) { this.formError.set('Completa todos los datos del empleado.'); return; }
    if (this.editingId() && !d.reason.trim()) { this.formError.set('Explica el motivo de la edición.'); return; }
    this.busy.set(true); this.formError.set('');
    try {
      const body = { username: d.username.trim(), fullName: d.fullName.trim(), ci: d.ci.trim(), birthDate: d.birthDate, phone: d.phone.trim() };
      const id = this.editingId();
      if (id) {
        const updated = await this.api.write<EmployeeSummary>('PUT', `/api/employees/${id}`, { ...body, reason: d.reason.trim() });
        this.formOpen.set(false); await this.load(); await this.openDetail(updated.id); this.message.set('Cuenta actualizada.');
      } else {
        const created = await this.api.write<TemporaryPassword>('POST', '/api/employees', body);
        this.formOpen.set(false); this.temporaryPassword.set(created.temporaryPassword); await this.load(); this.message.set(`Cuenta de ${created.employee.fullName} creada.`);
      }
    } catch (error) { this.formError.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async openDetail(id: string): Promise<void> { this.detailError.set(''); this.action.set(null); try { this.detail.set(await this.api.get<EmployeeDetail>(`/api/employees/${id}`)); } catch (error) { this.error.set(this.errorMessage(error)); } }
  openAction(value: 'deactivate' | 'reactivate' | 'reset'): void { this.action.set(value); this.actionReason = ''; this.detailError.set(''); }
  async confirmAction(): Promise<void> {
    const employee = this.detail()?.employee, action = this.action();
    if (!employee || !action || this.busy()) return;
    if (!this.actionReason.trim()) { this.detailError.set('Explica el motivo de esta acción.'); return; }
    this.busy.set(true); this.detailError.set('');
    try {
      const result = await this.api.write<EmployeeSummary | TemporaryPassword>('POST', `/api/employees/${employee.id}/${action === 'reset' ? 'reset-password' : action}`, { reason: this.actionReason.trim() });
      if (action === 'reset') this.temporaryPassword.set((result as TemporaryPassword).temporaryPassword);
      await this.load(); await this.openDetail(employee.id);
      this.message.set(action === 'deactivate' ? 'Cuenta desactivada. Sus sesiones se cerraron.' : action === 'reactivate' ? 'Cuenta reactivada.' : 'Contraseña restablecida.');
    } catch (error) { this.detailError.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  closePassword(): void { this.temporaryPassword.set(null); }
  private errorMessage(error: unknown): string { return error instanceof HttpErrorResponse && typeof error.error?.error === 'string' ? error.error.error : 'No se pudo completar la operación. Inténtalo nuevamente.'; }
}
