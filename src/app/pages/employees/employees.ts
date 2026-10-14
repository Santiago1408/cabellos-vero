import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoStore, Employee, EmployeeChange, EmployeeInput, dateLabel, modifiedLabel } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

type SortKey = 'fullName' | 'username' | 'ci' | 'phone' | 'status';
const blankEmployee = (): EmployeeInput => ({ fullName: '', username: '', ci: '', birthDate: '', phone: '', password: '' });

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [FormsModule, Icon],
  templateUrl: './employees.html',
  styleUrls: ['./employees.css', '../../shared/operation.css'],
})
export class Employees {
  readonly store = inject(DemoStore);
  readonly dateLabel = dateLabel;
  readonly modifiedLabel = modifiedLabel;
  readonly page = signal(1);
  readonly search = signal('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly sortKey = signal<SortKey>('fullName');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');
  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly detailId = signal<string | null>(null);
  readonly deactivateTarget = signal<Employee | null>(null);
  readonly resetTarget = signal<Employee | null>(null);
  readonly error = signal('');
  readonly actionError = signal('');
  draft = blankEmployee();
  newPassword = '';
  confirmPassword = '';

  readonly detail = computed(() => this.store.employees().find(item => item.id === this.detailId()));
  readonly detailHistory = computed(() => [...(this.detail()?.changes ?? [])].reverse());
  readonly filtered = computed(() => this.store.employees().filter(item => {
    const query = this.search().trim().toLocaleLowerCase('es-BO');
    return (!query || `${item.fullName} ${item.username} ${item.ci} ${item.phone}`.toLocaleLowerCase('es-BO').includes(query))
      && (this.statusFilter() === 'all' || item.active === (this.statusFilter() === 'active'));
  }));
  readonly sorted = computed(() => {
    const key = this.sortKey();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    return [...this.filtered()].sort((left, right) => {
      const a = key === 'status' ? (left.active ? 0 : 1) : left[key];
      const b = key === 'status' ? (right.active ? 0 : 1) : right[key];
      const comparison = typeof a === 'number' && typeof b === 'number'
        ? a - b : String(a).localeCompare(String(b), 'es-BO', { sensitivity: 'base' });
      return direction * comparison || left.fullName.localeCompare(right.fullName, 'es-BO') || left.id.localeCompare(right.id);
    });
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 8)));
  readonly pageItems = computed(() => this.sorted().slice((Math.min(this.page(), this.pageCount()) - 1) * 8, Math.min(this.page(), this.pageCount()) * 8));

  sortBy(key: SortKey) {
    if (this.sortKey() === key) this.sortDirection.update(value => value === 'asc' ? 'desc' : 'asc');
    else { this.sortKey.set(key); this.sortDirection.set('asc'); }
    this.page.set(1);
  }
  setMobileSort(value: string) {
    const [key, direction] = value.split(':') as [SortKey, 'asc' | 'desc'];
    this.sortKey.set(key); this.sortDirection.set(direction); this.page.set(1);
  }
  sortAria(key: SortKey) { return this.sortKey() === key ? this.sortDirection() === 'asc' ? 'ascending' : 'descending' : 'none'; }
  sortIndicator(key: SortKey) { return this.sortKey() === key ? this.sortDirection() === 'asc' ? '↑' : '↓' : '↕'; }
  updateSearch(value: string) { this.search.set(value); this.page.set(1); }
  updateStatus(value: 'all' | 'active' | 'inactive') { this.statusFilter.set(value); this.page.set(1); }
  openCreate() { this.editingId.set(null); this.draft = blankEmployee(); this.error.set(''); this.formOpen.set(true); }
  closeForm() { this.draft = blankEmployee(); this.editingId.set(null); this.formOpen.set(false); }
  openEdit(employee: Employee) {
    this.detailId.set(null);
    this.editingId.set(employee.id);
    this.draft = { fullName: employee.fullName, username: employee.username, ci: employee.ci,
      birthDate: employee.birthDate, phone: employee.phone, password: '' };
    this.error.set(''); this.formOpen.set(true);
  }
  save() {
    const { password, ...fields } = this.draft;
    const message = this.editingId()
      ? this.store.updateEmployee(this.editingId()!, fields)
      : this.store.addEmployee({ ...fields, password });
    if (message) { this.error.set(message); return; }
    this.closeForm(); this.page.set(1);
  }
  openDetail(id: string) { this.actionError.set(''); this.detailId.set(id); }
  askDeactivate(employee: Employee) { this.detailId.set(null); this.actionError.set(''); this.deactivateTarget.set(employee); }
  confirmDeactivate() {
    const employee = this.deactivateTarget();
    if (!employee) return;
    const message = this.store.setEmployeeActive(employee.id, false);
    if (message) { this.actionError.set(message); return; }
    this.deactivateTarget.set(null);
  }
  reactivate(employee: Employee) {
    const message = this.store.setEmployeeActive(employee.id, true);
    this.actionError.set(message);
  }
  openReset(employee: Employee) {
    this.detailId.set(null); this.actionError.set(''); this.newPassword = ''; this.confirmPassword = '';
    this.resetTarget.set(employee);
  }
  closeReset() { this.newPassword = ''; this.confirmPassword = ''; this.resetTarget.set(null); }
  resetPassword() {
    const employee = this.resetTarget();
    if (!employee) return;
    if (this.newPassword !== this.confirmPassword) { this.actionError.set('Las contraseñas no coinciden.'); return; }
    const message = this.store.resetEmployeePassword(employee.id, this.newPassword);
    if (message) { this.actionError.set(message); return; }
    this.closeReset();
  }
  changeRows(change: EmployeeChange) {
    const before = change.before;
    if (!before) return [];
    const after = change.after;
    return [
      { label: 'Nombre', before: before.fullName, after: after.fullName, changed: before.fullName !== after.fullName },
      { label: 'Usuario', before: before.username, after: after.username, changed: before.username !== after.username },
      { label: 'CI', before: before.ci, after: after.ci, changed: before.ci !== after.ci },
      { label: 'Nacimiento', before: dateLabel(before.birthDate), after: dateLabel(after.birthDate), changed: before.birthDate !== after.birthDate },
      { label: 'Celular', before: before.phone, after: after.phone, changed: before.phone !== after.phone },
      { label: 'Estado', before: before.active ? 'Activo' : 'Desactivado', after: after.active ? 'Activo' : 'Desactivado', changed: before.active !== after.active },
    ].filter(row => row.changed);
  }
}
