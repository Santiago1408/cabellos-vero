import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../data/api-client';
import { AuthSession } from '../../data/auth-session';
import { Icon } from '../../shared/icon/icon';

type Supplier = {
  id: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  mapsUrl: string;
  createdAt: string;
  modifiedAt: string | null;
};
type SupplierForm = Pick<Supplier, 'name' | 'phone' | 'city' | 'address' | 'mapsUrl'>;
type SupplierHistory = {
  id: number;
  changedAt: string;
  eventType: string;
  reason: string | null;
  oldValues: SupplierForm | null;
  newValues: SupplierForm | null;
};
type SortKey = 'name' | 'phone' | 'city' | 'createdAt';

const emptyForm = (): SupplierForm => ({ name: '', phone: '', city: '', address: '', mapsUrl: '' });
const fieldLabels: { key: keyof SupplierForm; label: string }[] = [
  { key: 'name', label: 'Nombre' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'city', label: 'Ciudad' },
  { key: 'address', label: 'Dirección' },
  { key: 'mapsUrl', label: 'Google Maps' },
];

@Component({
  selector: 'app-connected-suppliers',
  standalone: true,
  imports: [FormsModule, DatePipe, Icon],
  templateUrl: './connected-suppliers.html',
  styleUrls: ['./connected-suppliers.css', '../../shared/operation.css'],
})
export class ConnectedSuppliers implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly session = inject(AuthSession);
  readonly suppliers = signal<Supplier[]>([]);
  readonly sortedSuppliers = computed(() => {
    const key = this.sortKey();
    const direction = this.sortDirection();
    return [...this.suppliers()].sort((left, right) => {
      const a = left[key] ?? '';
      const b = right[key] ?? '';
      return direction * a.localeCompare(b, 'es-BO', { numeric: true, sensitivity: 'base' });
    });
  });
  readonly selected = signal<Supplier | null>(null);
  readonly history = signal<SupplierHistory[]>([]);
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly message = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal(false);
  readonly deleteOpen = signal(false);
  readonly sortKey = signal<SortKey>('name');
  readonly sortDirection = signal<1 | -1>(1);
  form = emptyForm();
  reason = '';
  deleteReason = '';

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.suppliers.set(await this.api.get<Supplier[]>('/api/suppliers'));
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  sortBy(key: SortKey): void {
    if (this.sortKey() === key) this.sortDirection.update(value => value === 1 ? -1 : 1);
    else { this.sortKey.set(key); this.sortDirection.set(1); }
  }
  setMobileSort(value: string): void {
    const [key, direction] = value.split(':');
    this.sortKey.set(key as SortKey);
    this.sortDirection.set(direction === 'desc' ? -1 : 1);
  }

  async select(supplier: Supplier): Promise<void> {
    if (this.busy()) return;
    this.selected.set(supplier);
    this.deleteOpen.set(false);
    this.error.set('');
    try {
      this.history.set(await this.api.get<SupplierHistory[]>(`/api/suppliers/${supplier.id}/history`));
    } catch (error) {
      this.error.set(this.errorMessage(error));
    }
  }

  create(): void {
    if (this.busy()) return;
    this.form = emptyForm();
    this.reason = '';
    this.editing.set(false);
    this.formOpen.set(true);
    this.error.set('');
  }

  edit(supplier: Supplier): void {
    if (this.busy()) return;
    void this.select(supplier);
    this.form = { name: supplier.name, phone: supplier.phone, city: supplier.city,
      address: supplier.address, mapsUrl: supplier.mapsUrl };
    this.reason = '';
    this.editing.set(true);
    this.formOpen.set(true);
    this.error.set('');
  }

  beginDelete(supplier: Supplier): void {
    if (this.busy()) return;
    void this.select(supplier);
    this.deleteReason = '';
    this.deleteOpen.set(true);
  }

  closeForm(): void { if (!this.busy()) this.formOpen.set(false); }

  async save(): Promise<void> {
    if (this.busy()) return;
    if (!this.form.name.trim() || !this.form.phone.trim()) {
      this.error.set('Nombre y teléfono son obligatorios.');
      return;
    }
    if (this.editing() && !this.reason.trim()) {
      this.error.set('Indica el motivo de la edición.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const supplier = this.editing()
        ? await this.api.write<Supplier>('PUT', `/api/suppliers/${this.selected()!.id}`,
          { ...this.form, reason: this.reason.trim() })
        : await this.api.write<Supplier>('POST', '/api/suppliers', this.form);
      this.formOpen.set(false);
      this.selected.set(supplier);
      this.suppliers.set(await this.api.get<Supplier[]>('/api/suppliers'));
      this.history.set(await this.api.get<SupplierHistory[]>(`/api/suppliers/${supplier.id}/history`));
      this.message.set(this.editing() ? 'Proveedor actualizado.' : 'Proveedor registrado.');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    const supplier = this.selected();
    if (!supplier || this.busy()) return;
    if (!this.deleteReason.trim()) {
      this.error.set('Indica el motivo de la eliminación.');
      return;
    }
    if (!confirm(`¿Eliminar a «${supplier.name}»? Esta acción no se puede deshacer.`)) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await this.api.write<void>('DELETE', `/api/suppliers/${supplier.id}`,
        { reason: this.deleteReason.trim() });
      this.suppliers.set(await this.api.get<Supplier[]>('/api/suppliers'));
      this.selected.set(null);
      this.history.set([]);
      this.deleteOpen.set(false);
      this.deleteReason = '';
      this.message.set('Proveedor eliminado.');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  historyChanges(entry: SupplierHistory): { label: string; before: string; after: string }[] {
    return fieldLabels.filter(({ key }) => (entry.oldValues?.[key] ?? '') !== (entry.newValues?.[key] ?? ''))
      .map(({ key, label }) => ({ label, before: entry.oldValues?.[key] || '—',
        after: entry.newValues?.[key] || '—' }));
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'No se pudo completar la solicitud.';
    if (error.status === 0) return 'No se pudo conectar con la API.';
    if (error.status === 401) {
      void this.session.restore().catch(() => undefined);
      return 'La sesión ha vencido. Recarga la página para ingresar nuevamente.';
    }
    const message = error.error?.error;
    return typeof message === 'string' ? message : 'El servidor no pudo completar la solicitud.';
  }
}
