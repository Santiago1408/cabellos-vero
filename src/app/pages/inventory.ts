import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DemoStore, Product, dateLabel, downloadCsv, money, stockStatus } from '../data/demo-store';
import { Icon } from '../shared/icon';

const blankProduct = (): Product => ({ id: '', name: '', category: '', price: 0, quantity: 0, threshold: 0, unit: 'unid.', expiry: '', supplier: '', sold: 0 });

@Component({ selector: 'app-inventory', standalone: true, imports: [FormsModule, RouterLink, Icon], template: `
  <div class="page-header"><div><div class="eyebrow">CATÁLOGO</div><h1>Inventario</h1><p>Consulta y administra tus productos.</p></div></div>
  <section class="card summary-card"><div class="card-heading"><h2>Resumen del inventario</h2><span class="period-pill">En tiempo real · Demo</span></div><div class="summary-grid four">
    <div class="summary-item"><span>Categorías</span><strong>{{ categories().length }}</strong><small>Registradas</small></div>
    <div class="summary-item"><span>Productos</span><strong>{{ store.products().length }}</strong><small>En el catálogo</small></div>
    <div class="summary-item"><span>Unidades en stock</span><strong>{{ totalUnits() }}</strong><small>{{ money(stockValue()) }} en inventario</small></div>
    <div class="summary-item"><span>Por reponer</span><strong>{{ lowCount() }}</strong><small>Stock bajo o agotado</small></div>
  </div></section>
  <section class="card table-card"><div class="card-heading table-heading"><div><h2>Productos</h2><p>{{ filtered().length }} resultados</p></div><div class="card-actions">@if (store.role() === 'admin') { <button class="btn btn-primary" (click)="openCreate()"><app-icon name="plus"/> Agregar producto</button> }<select class="btn btn-outline filter-select" aria-label="Filtrar por categoría" [ngModel]="category()" (ngModelChange)="category.set($event);page.set(1)"><option value="">Todas las categorías</option>@for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }</select><button class="btn btn-outline" (click)="export()"><app-icon name="download"/> <span class="hide-small">Descargar</span></button></div></div>
    <div class="table-scroll"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Precio de compra</th><th>Cantidad</th><th>Stock mínimo</th><th>Vencimiento</th><th>Estado</th></tr></thead><tbody>@for (p of pageItems(); track p.id) { <tr><td><a [routerLink]="['/inventario',p.id]" class="table-primary">{{ p.name }}</a><small class="table-sub">{{ p.id }}</small></td><td>{{ p.category }}</td><td>{{ money(p.price) }}</td><td>{{ p.quantity }} {{ p.unit }}</td><td>{{ p.threshold }} {{ p.unit }}</td><td>{{ dateLabel(p.expiry) }}</td><td><span class="status" [class.status-good]="stockStatus(p)==='Disponible'" [class.status-warn]="stockStatus(p)==='Stock bajo'" [class.status-bad]="stockStatus(p)==='Agotado'">{{ stockStatus(p) }}</span></td></tr> } @empty { <tr><td colspan="7" class="empty-table">No encontramos productos con ese criterio.</td></tr> }</tbody></table></div>
    <div class="table-footer"><button class="btn btn-outline" [disabled]="page()===1" (click)="page.update(n=>n-1)">Anterior</button><span>Página {{ page() }} de {{ pageCount() }}</span><button class="btn btn-outline" [disabled]="page()>=pageCount()" (click)="page.update(n=>n+1)">Siguiente</button></div>
  </section>
  @if (modalOpen()) { <div class="modal-backdrop" (click)="close()"><section class="modal-card" role="dialog" aria-modal="true" aria-label="Nuevo producto" (click)="$event.stopPropagation()"><div class="modal-header"><div><div class="eyebrow">INVENTARIO</div><h2>Nuevo producto</h2></div><button class="icon-button" aria-label="Cerrar" (click)="close()"><app-icon name="close"/></button></div><form (ngSubmit)="save()" class="modal-form">
    <div class="form-grid"><label class="field-label">Nombre del producto<input class="field-input" name="productName" [(ngModel)]="draft.name" required placeholder="Ej. Shampoo hidratante" /></label><label class="field-label">Código<input class="field-input" name="productId" [(ngModel)]="draft.id" required placeholder="Ej. PRO-011" /></label><label class="field-label">Categoría<select class="field-input" name="category" [(ngModel)]="draft.category" required><option value="">Seleccionar</option>@for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }<option value="Otros">Otros</option></select></label><label class="field-label">Precio de compra (Bs.)<input class="field-input" type="number" min="0" name="price" [(ngModel)]="draft.price" required /></label><label class="field-label">Cantidad<input class="field-input" type="number" min="0" name="quantity" [(ngModel)]="draft.quantity" required /></label><label class="field-label">Unidad<input class="field-input" name="unit" [(ngModel)]="draft.unit" required /></label><label class="field-label">Fecha de vencimiento<input class="field-input" type="date" name="expiry" [(ngModel)]="draft.expiry" /></label><label class="field-label">Stock mínimo<input class="field-input" type="number" min="0" name="threshold" [(ngModel)]="draft.threshold" required /></label><label class="field-label form-wide">Proveedor<select class="field-input" name="supplier" [(ngModel)]="draft.supplier"><option value="">Sin asignar</option>@for (s of store.suppliers(); track s.id) { <option [value]="s.name">{{ s.name }}</option> }</select></label></div>
    @if (error()) { <p class="form-error">{{ error() }}</p> }<div class="modal-actions"><button type="button" class="btn btn-outline" (click)="close()">Cancelar</button><button type="submit" class="btn btn-primary">Agregar producto</button></div>
  </form></section></div> }
` })
export class Inventory {
  readonly store = inject(DemoStore); readonly money = money; readonly dateLabel = dateLabel; readonly stockStatus = stockStatus;
  readonly page = signal(1); readonly modalOpen = signal(false); readonly error = signal('');
  readonly category = signal(''); draft = blankProduct();
  readonly categories = computed(() => [...new Set(this.store.products().map(p => p.category))].sort());
  readonly totalUnits = computed(() => this.store.products().reduce((sum,p) => sum+p.quantity,0));
  readonly stockValue = computed(() => this.store.products().reduce((sum,p) => sum+p.quantity*p.price,0));
  readonly lowCount = computed(() => this.store.products().filter(p => p.quantity<=p.threshold).length);
  readonly filtered = computed(() => this.store.products().filter(p => (!this.category() || p.category === this.category()) && `${p.name} ${p.id} ${p.category} ${p.supplier}`.toLowerCase().includes(this.store.query().toLowerCase())));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 7)));
  readonly pageItems = computed(() => this.filtered().slice((Math.min(this.page(),this.pageCount())-1)*7, Math.min(this.page(),this.pageCount())*7));
  openCreate() { this.draft = blankProduct(); this.error.set(''); this.modalOpen.set(true); }
  close() { this.modalOpen.set(false); }
  save() { if (!this.draft.name.trim() || !this.draft.id.trim() || !this.draft.category) { this.error.set('Completa el nombre, código y categoría.'); return; } if (this.store.products().some(p => p.id.toLowerCase() === this.draft.id.toLowerCase())) { this.error.set('Ese código de producto ya existe.'); return; } this.store.addProduct({...this.draft}); this.page.set(1); this.close(); }
  export() { downloadCsv('inventario-cabellos-vero.csv',['Código','Producto','Categoría','Precio Bs.','Cantidad','Stock mínimo','Estado'],this.filtered().map(p=>[p.id,p.name,p.category,p.price,p.quantity,p.threshold,stockStatus(p)])); }
}
