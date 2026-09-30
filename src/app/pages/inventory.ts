import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DemoStore, Product, categoryLabel, downloadCsv, hairCategories, hairLengths, money, productName, stockStatus, weight } from '../data/demo-store';
import { Icon } from '../shared/icon';

const blankProduct = (): Product => ({ id: '', name: '', category: 'normal', length: 38, purchasePrice: 0, salePrice: 0, quantity: 0, threshold: 0, unit: 'g', color: '', quality: '', supplier: '', sold: 0 });

@Component({ selector: 'app-inventory', standalone: true, imports: [FormsModule, RouterLink, Icon], template: `
  <div class="page-header"><div><div class="eyebrow">CATÁLOGO DE CABELLO</div><h1>Inventario</h1><p>Controla el cabello disponible por categoría, longitud y peso.</p></div></div>
  <section class="card summary-card"><div class="card-heading"><h2>Resumen del inventario</h2><span class="period-pill">En tiempo real · Demo</span></div><div class="summary-grid four">
    <div class="summary-item"><span>Categorías</span><strong>{{ categories.length }}</strong><small>Normal, choco, tinturado, premium y elite</small></div>
    <div class="summary-item"><span>Productos</span><strong>{{ store.products().length }}</strong><small>Combinaciones registradas</small></div>
    <div class="summary-item"><span>Peso disponible</span><strong>{{ weight(totalWeight()) }}</strong><small>{{ money(stockValue()) }} a costo</small></div>
    <div class="summary-item"><span>Por reponer</span><strong>{{ lowCount() }}</strong><small>Stock bajo o agotado</small></div>
  </div></section>
  <section class="card table-card"><div class="card-heading table-heading"><div><h2>Cabellos</h2><p>{{ filtered().length }} resultados</p></div><div class="card-actions">
    @if (store.role() === 'admin') { <button class="btn btn-primary" (click)="openCreate()"><app-icon name="plus"/> Agregar cabello</button> }
    <select class="btn btn-outline filter-select" aria-label="Filtrar por categoría" [ngModel]="category()" (ngModelChange)="category.set($event);page.set(1)"><option value="">Todas las categorías</option>@for (c of categories; track c) { <option [value]="c">{{ categoryLabel(c) }}</option> }</select>
    <select class="btn btn-outline filter-select" aria-label="Filtrar por longitud" [ngModel]="length()" (ngModelChange)="length.set($event);page.set(1)"><option value="">Todas las longitudes</option>@for (cm of lengths; track cm) { <option [value]="cm">{{ cm }} cm</option> }</select>
    <button class="btn btn-outline" (click)="export()"><app-icon name="download"/> <span class="hide-small">Descargar</span></button>
  </div></div>
    <div class="table-scroll"><table><thead><tr><th>Producto</th><th>Categoría</th><th>Longitud</th><th>Color / calidad</th><th>Compra</th><th>Venta</th><th>Peso disponible</th><th>Estado</th></tr></thead><tbody>@for (p of pageItems(); track p.id) { <tr><td><a [routerLink]="['/inventario',p.id]" class="table-primary">{{ p.name }}</a><small class="table-sub">{{ p.id }}</small></td><td>{{ categoryLabel(p.category) }}</td><td>{{ p.length }} cm</td><td>{{ p.color }}<small class="table-sub">{{ p.quality }}</small></td><td>{{ money(p.purchasePrice) }}/g</td><td>{{ money(p.salePrice) }}/g</td><td>{{ weight(p.quantity) }}</td><td><span class="status" [class.status-good]="stockStatus(p)==='Disponible'" [class.status-warn]="stockStatus(p)==='Stock bajo'" [class.status-bad]="stockStatus(p)==='Agotado'">{{ stockStatus(p) }}</span></td></tr> } @empty { <tr><td colspan="8" class="empty-table">No encontramos cabello con ese criterio.</td></tr> }</tbody></table></div>
    <div class="table-footer"><button class="btn btn-outline" [disabled]="page()===1" (click)="page.update(n=>n-1)">Anterior</button><span>Página {{ page() }} de {{ pageCount() }}</span><button class="btn btn-outline" [disabled]="page()>=pageCount()" (click)="page.update(n=>n+1)">Siguiente</button></div>
  </section>
  @if (modalOpen()) { <div class="modal-backdrop" (click)="close()"><section class="modal-card" role="dialog" aria-modal="true" aria-label="Nuevo cabello" (click)="$event.stopPropagation()"><div class="modal-header"><div><div class="eyebrow">INVENTARIO</div><h2>Nuevo cabello</h2></div><button class="icon-button" aria-label="Cerrar" (click)="close()"><app-icon name="close"/></button></div><form (ngSubmit)="save()" class="modal-form">
    <p class="inline-hint">Se registrará como <strong>{{ generatedName }}</strong>. Cada combinación de categoría y longitud es un producto diferente.</p>
    <div class="form-grid"><label class="field-label">Código<input class="field-input" name="productId" [(ngModel)]="draft.id" required placeholder="Ej. CAB-013" /></label><label class="field-label">Categoría<select class="field-input" name="category" [(ngModel)]="draft.category" required>@for (c of categories; track c) { <option [ngValue]="c">{{ categoryLabel(c) }}</option> }</select></label><label class="field-label">Longitud<select class="field-input" name="length" [(ngModel)]="draft.length" required>@for (cm of lengths; track cm) { <option [ngValue]="cm">{{ cm }} cm</option> }</select></label><label class="field-label">Color<input class="field-input" name="color" [(ngModel)]="draft.color" required placeholder="Ej. Negro natural" /></label><label class="field-label">Calidad<input class="field-input" name="quality" [(ngModel)]="draft.quality" required placeholder="Ej. Remy" /></label><label class="field-label">Precio de compra por gramo (Bs.)<input class="field-input" type="number" min="0" step="0.01" name="purchasePrice" [(ngModel)]="draft.purchasePrice" required /></label><label class="field-label">Precio de venta por gramo (Bs.)<input class="field-input" type="number" min="0" step="0.01" name="salePrice" [(ngModel)]="draft.salePrice" required /></label><label class="field-label">Peso disponible (g)<input class="field-input" type="number" min="0" name="quantity" [(ngModel)]="draft.quantity" required /></label><label class="field-label">Stock mínimo (g)<input class="field-input" type="number" min="0" name="threshold" [(ngModel)]="draft.threshold" required /></label><label class="field-label">Proveedor<select class="field-input" name="supplier" [(ngModel)]="draft.supplier"><option value="">Sin asignar</option>@for (s of store.suppliers(); track s.id) { <option [value]="s.name">{{ s.name }}</option> }</select></label></div>
    @if (error()) { <p class="form-error">{{ error() }}</p> }<div class="modal-actions"><button type="button" class="btn btn-outline" (click)="close()">Cancelar</button><button type="submit" class="btn btn-primary">Agregar cabello</button></div>
  </form></section></div> }
` })
export class Inventory {
  readonly store = inject(DemoStore); readonly money = money; readonly weight = weight; readonly categoryLabel = categoryLabel; readonly stockStatus = stockStatus;
  readonly categories = hairCategories; readonly lengths = hairLengths;
  readonly page = signal(1); readonly modalOpen = signal(false); readonly error = signal('');
  readonly category = signal(''); readonly length = signal<number | ''>(''); draft = blankProduct();
  readonly totalWeight = computed(() => this.store.products().reduce((sum,p) => sum+p.quantity,0));
  readonly stockValue = computed(() => this.store.products().reduce((sum,p) => sum+p.quantity*p.purchasePrice,0));
  readonly lowCount = computed(() => this.store.products().filter(p => p.quantity<=p.threshold).length);
  readonly filtered = computed(() => this.store.products().filter(p => (!this.category() || p.category === this.category()) && (!this.length() || p.length === Number(this.length())) && `${p.name} ${p.id} ${p.category} ${p.length} ${p.color} ${p.quality} ${p.supplier}`.toLowerCase().includes(this.store.query().toLowerCase())));
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / 7)));
  readonly pageItems = computed(() => this.filtered().slice((Math.min(this.page(),this.pageCount())-1)*7, Math.min(this.page(),this.pageCount())*7));
  get generatedName() { return productName(this.draft.category, this.draft.length); }
  openCreate() { this.draft = blankProduct(); this.error.set(''); this.modalOpen.set(true); }
  close() { this.modalOpen.set(false); }
  save() {
    if (!this.draft.id.trim() || !this.draft.color.trim() || !this.draft.quality.trim()) { this.error.set('Completa código, color y calidad.'); return; }
    if (this.store.products().some(p => p.id.toLowerCase() === this.draft.id.toLowerCase())) { this.error.set('Ese código de producto ya existe.'); return; }
    if (this.store.products().some(p => p.category === this.draft.category && p.length === this.draft.length)) { this.error.set('Ya existe un producto con esa categoría y longitud.'); return; }
    if (this.draft.salePrice < this.draft.purchasePrice) { this.error.set('El precio de venta no puede ser menor al precio de compra.'); return; }
    this.store.addProduct({...this.draft, name: this.generatedName}); this.page.set(1); this.close();
  }
  export() { downloadCsv('inventario-cabellos-vero.csv',['Código','Producto','Categoría','Longitud cm','Color','Calidad','Compra Bs/g','Venta Bs/g','Peso g','Stock mínimo g','Estado'],this.filtered().map(p=>[p.id,p.name,categoryLabel(p.category),p.length,p.color,p.quality,p.purchasePrice,p.salePrice,p.quantity,p.threshold,stockStatus(p)])); }
}
