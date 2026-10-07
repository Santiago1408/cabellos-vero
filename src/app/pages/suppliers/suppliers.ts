import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoStore, Supplier, downloadCsv, modifiedLabel } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

type SortKey = 'name' | 'phone' | 'city' | 'address';
const blankSupplier = (): Supplier => ({ id: '', name: '', phone: '', city: '', address: '', mapsUrl: '' });

@Component({selector:'app-suppliers',standalone:true,imports:[FormsModule,Icon],templateUrl: './suppliers.html',
  styleUrls: ['./suppliers.css', '../../shared/operation.css']})
export class Suppliers {
  readonly store = inject(DemoStore);
  readonly modifiedLabel = modifiedLabel;
  readonly modalOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly detailId = signal<string | null>(null);
  readonly error = signal('');
  readonly deleteTarget = signal<Supplier | null>(null);
  readonly deleteError = signal('');
  readonly page = signal(1);
  readonly sortKey = signal<SortKey>('name');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');
  draft = blankSupplier();

  readonly filtered = computed(() => this.store.suppliers());
  readonly sorted = computed(() => {
    const key = this.sortKey();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    return [...this.filtered()].sort((left, right) =>
      direction * left[key].localeCompare(right[key], 'es-BO', { sensitivity: 'base' })
      || left.name.localeCompare(right.name, 'es-BO', { sensitivity: 'base' })
      || left.id.localeCompare(right.id));
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 8)));
  readonly pageItems = computed(() => this.sorted().slice((Math.min(this.page(), this.pageCount()) - 1) * 8, Math.min(this.page(), this.pageCount()) * 8));
  readonly detail = computed(() => this.store.suppliers().find(supplier => supplier.id === this.detailId()));

  sortBy(key: SortKey) {
    if (this.sortKey() === key) this.sortDirection.update(direction => direction === 'asc' ? 'desc' : 'asc');
    else { this.sortKey.set(key); this.sortDirection.set('asc'); }
    this.page.set(1);
  }
  sortAria(key: SortKey) { return this.sortKey() === key ? this.sortDirection() === 'asc' ? 'ascending' : 'descending' : 'none'; }
  sortIndicator(key: SortKey) { return this.sortKey() === key ? this.sortDirection() === 'asc' ? '↑' : '↓' : '↕'; }
  open() {
    this.editingId.set(null);
    this.draft = blankSupplier();
    this.error.set('');
    this.modalOpen.set(true);
  }
  openEdit(supplier: Supplier) {
    this.detailId.set(null);
    this.editingId.set(supplier.id);
    this.draft = { ...supplier };
    this.error.set('');
    this.modalOpen.set(true);
  }
  save() {
    const name = this.draft.name.trim();
    const phone = this.draft.phone.trim();
    if (!name || !phone) { this.error.set('Completa el nombre y el teléfono.'); return; }
    if (this.store.suppliers().some(supplier => supplier.id !== this.editingId() && supplier.name.localeCompare(name, 'es-BO', { sensitivity: 'base' }) === 0)) {
      this.error.set('Ya existe un proveedor con ese nombre.'); return;
    }
    const mapsUrl = this.draft.mapsUrl.trim();
    if (mapsUrl) {
      try {
        const url = new URL(mapsUrl);
        const host = url.hostname.toLowerCase();
        const googleMaps = host === 'maps.app.goo.gl'
          || host === 'maps.google.com'
          || (host === 'goo.gl' && url.pathname.startsWith('/maps'))
          || (/^(www\.)?google\.[a-z.]+$/.test(host) && url.pathname.startsWith('/maps'));
        if (url.protocol !== 'https:' || !googleMaps) throw new Error('Invalid Google Maps URL');
      } catch {
        this.error.set('Ingresa un enlace HTTPS válido de Google Maps.'); return;
      }
    }
    const supplier = { ...this.draft, name, phone, city: this.draft.city.trim(), address: this.draft.address.trim(), mapsUrl };
    if (this.editingId()) {
      if (!this.store.updateSupplier(supplier)) { this.error.set('No encontramos el proveedor que deseas editar.'); return; }
    } else {
      const next = Math.max(0, ...this.store.suppliers().map(item => Number(item.id.match(/^PROV-(\d+)$/)?.[1]) || 0)) + 1;
      this.store.addSupplier({ ...supplier, id: `PROV-${String(next).padStart(3, '0')}` });
    }
    this.page.set(1);
    this.modalOpen.set(false);
  }
  askDelete(supplier: Supplier) { this.detailId.set(null); this.deleteError.set(''); this.deleteTarget.set(supplier); }
  confirmDelete() {
    const supplier = this.deleteTarget();
    if (!supplier) return;
    const message = this.store.removeSupplier(supplier.id);
    if (message) { this.deleteError.set(message); return; }
    this.deleteTarget.set(null);
    this.page.set(1);
  }
  export() {
    downloadCsv('proveedores-cabello.csv', ['Proveedor', 'Teléfono', 'Ciudad', 'Dirección', 'Enlace de Google Maps'],
      this.sorted().map(supplier => [supplier.name, supplier.phone, supplier.city, supplier.address, supplier.mapsUrl]));
  }
}
