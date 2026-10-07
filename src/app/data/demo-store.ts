import { computed, Injectable, signal } from '@angular/core';
import { calculateFifo, openingLots } from './fifo';

export type Role = 'admin' | 'user';
export const hairCategories = ['normal', 'choco', 'tinturado', 'premium', 'elite'] as const;
export const hairLengths = [38, 40, 45, 50, 55, 60, 70, 80, 90, 100] as const;
export type HairCategory = string;
export type HairLength = number;

export type Product = {
  id: string;
  name: string;
  category: HairCategory;
  length: HairLength;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  threshold: number;
  unit: 'g';
  color: string;
  quality: string;
  supplier: string;
  sold: number;
};
export type Supplier = { id: string; name: string; phone: string; city: string; address: string; mapsUrl: string; modifiedAt?: string };
export type OperationStatus = 'Pendiente' | 'Confirmado';
export type HairLine = { productId: string; category: HairCategory; length: HairLength; quantity: number; unitPrice: number };
export type Order = { id: string; supplier: string; date: string; status: OperationStatus; items: HairLine[]; modifiedAt?: string };
export type Sale = { id: string; customer: string; date: string; status: OperationStatus; items: HairLine[]; modifiedAt?: string };
export type SaleShortage = { product: Product; requested: number; physical: number; pending: number; missing: number };
export type SaleResult = { kind: 'saved'; status: OperationStatus }
  | { kind: 'needs-pending'; product: Product; available: number; pending: number }
  | { kind: 'insufficient'; shortages: SaleShortage[] }
  | { kind: 'error'; message: string };
export type DebtKind = 'Por cobrar' | 'Por pagar';
export type Debt = { id: string; party: string; phone: string; kind: DebtKind; total: number; paid: number; date: string; dueDate: string; notes: string };
export type DebtStatus = 'Pendiente' | 'Parcial' | 'Pagada' | 'Vencida';
export type MonthlySummary = { key: string; label: string; purchases: number; sales: number; costs: number; profit: number };

const initialProducts: Product[] = [
  { id: 'CAB-001', name: 'Cabello normal 38 cm', category: 'normal', length: 38, purchasePrice: 2.2, salePrice: 3.2, quantity: 2450, threshold: 500, unit: 'g', color: 'Castaño oscuro', quality: 'Natural seleccionado', supplier: 'Acopio Cochabamba', sold: 1850 },
  { id: 'CAB-002', name: 'Cabello normal 45 cm', category: 'normal', length: 45, purchasePrice: 2.8, salePrice: 4.1, quantity: 1320, threshold: 450, unit: 'g', color: 'Negro natural', quality: 'Natural seleccionado', supplier: 'Acopio Cochabamba', sold: 1420 },
  { id: 'CAB-003', name: 'Cabello choco 40 cm', category: 'choco', length: 40, purchasePrice: 3.1, salePrice: 4.5, quantity: 1860, threshold: 500, unit: 'g', color: 'Chocolate', quality: 'Doble seleccionado', supplier: 'Cabellos del Valle', sold: 1760 },
  { id: 'CAB-004', name: 'Cabello choco 55 cm', category: 'choco', length: 55, purchasePrice: 4.6, salePrice: 6.5, quantity: 720, threshold: 600, unit: 'g', color: 'Chocolate medio', quality: 'Doble seleccionado', supplier: 'Cabellos del Valle', sold: 1190 },
  { id: 'CAB-005', name: 'Cabello tinturado 45 cm', category: 'tinturado', length: 45, purchasePrice: 3.6, salePrice: 5.2, quantity: 980, threshold: 500, unit: 'g', color: 'Rubio oscuro', quality: 'Procesado uniforme', supplier: 'Acopio Oriental', sold: 970 },
  { id: 'CAB-006', name: 'Cabello tinturado 60 cm', category: 'tinturado', length: 60, purchasePrice: 5.7, salePrice: 8.1, quantity: 430, threshold: 550, unit: 'g', color: 'Cobrizo', quality: 'Procesado uniforme', supplier: 'Acopio Oriental', sold: 810 },
  { id: 'CAB-007', name: 'Cabello premium 50 cm', category: 'premium', length: 50, purchasePrice: 5.4, salePrice: 7.8, quantity: 1580, threshold: 600, unit: 'g', color: 'Negro natural', quality: 'Remy', supplier: 'Select Hair Bolivia', sold: 2030 },
  { id: 'CAB-008', name: 'Cabello premium 60 cm', category: 'premium', length: 60, purchasePrice: 6.8, salePrice: 9.7, quantity: 1120, threshold: 650, unit: 'g', color: 'Castaño natural', quality: 'Remy', supplier: 'Select Hair Bolivia', sold: 1650 },
  { id: 'CAB-009', name: 'Cabello premium 70 cm', category: 'premium', length: 70, purchasePrice: 8.1, salePrice: 11.5, quantity: 510, threshold: 600, unit: 'g', color: 'Negro natural', quality: 'Remy largo', supplier: 'Select Hair Bolivia', sold: 940 },
  { id: 'CAB-010', name: 'Cabello elite 55 cm', category: 'elite', length: 55, purchasePrice: 7.4, salePrice: 10.8, quantity: 1360, threshold: 500, unit: 'g', color: 'Castaño virgen', quality: 'Virgen doble seleccionado', supplier: 'Mujeres del Altiplano', sold: 1280 },
  { id: 'CAB-011', name: 'Cabello elite 80 cm', category: 'elite', length: 80, purchasePrice: 10.6, salePrice: 14.9, quantity: 390, threshold: 450, unit: 'g', color: 'Negro virgen', quality: 'Virgen doble seleccionado', supplier: 'Mujeres del Altiplano', sold: 620 },
  { id: 'CAB-012', name: 'Cabello elite 100 cm', category: 'elite', length: 100, purchasePrice: 14.2, salePrice: 19.8, quantity: 0, threshold: 300, unit: 'g', color: 'Negro virgen', quality: 'Virgen extra largo', supplier: 'Mujeres del Altiplano', sold: 280 },
];

const initialSuppliers: Supplier[] = [
  { id: 'PROV-001', name: 'Acopio Cochabamba', phone: '70321456', city: 'Cochabamba', address: '', mapsUrl: '' },
  { id: 'PROV-002', name: 'Cabellos del Valle', phone: '71245890', city: '', address: '', mapsUrl: '' },
  { id: 'PROV-003', name: 'Acopio Oriental', phone: '72134678', city: '', address: '', mapsUrl: '' },
  { id: 'PROV-004', name: 'Select Hair Bolivia', phone: '73456712', city: '', address: '', mapsUrl: '' },
  { id: 'PROV-005', name: 'Mujeres del Altiplano', phone: '76543210', city: '', address: '', mapsUrl: '' },
];

const demoLine = (productId: string, quantity: number, unitPrice: number): HairLine => {
  const product = initialProducts.find(item => item.id === productId)!;
  return { productId, category: product.category, length: product.length, quantity, unitPrice };
};

const initialOrders: Order[] = [
  { id: 'COMP-1046', supplier: 'Acopio Cochabamba', date: '2026-09-25', status: 'Confirmado', items: [demoLine('CAB-001', 1800, 2.2), demoLine('CAB-002', 250, 2.8)] },
  { id: 'COMP-1045', supplier: 'Select Hair Bolivia', date: '2026-09-24', status: 'Pendiente', items: [demoLine('CAB-008', 1200, 6.8)] },
  { id: 'COMP-1044', supplier: 'Cabellos del Valle', date: '2026-09-20', status: 'Pendiente', items: [demoLine('CAB-004', 950, 4.6)] },
  { id: 'COMP-1043', supplier: 'Mujeres del Altiplano', date: '2026-09-18', status: 'Confirmado', items: [demoLine('CAB-010', 700, 7.4)] },
  { id: 'COMP-1042', supplier: 'Acopio Oriental', date: '2026-09-15', status: 'Confirmado', items: [demoLine('CAB-005', 1200, 3.6)] },
];

const initialSales: Sale[] = [
  { id: 'VTA-2088', customer: 'Valentina Rojas', date: '2026-09-21', status: 'Confirmado', items: [demoLine('CAB-007', 420, 7.8)] },
  { id: 'VTA-2087', customer: 'Salón Renueva', date: '2026-09-19', status: 'Confirmado', items: [demoLine('CAB-001', 600, 3.2), demoLine('CAB-002', 280, 4.1)] },
  { id: 'VTA-2086', customer: 'Extensiones Mía', date: '2026-09-17', status: 'Confirmado', items: [demoLine('CAB-010', 350, 10.8)] },
  { id: 'VTA-2085', customer: 'Mariela Flores', date: '2026-09-14', status: 'Confirmado', items: [demoLine('CAB-003', 300, 4.5)] },
  { id: 'VTA-2084', customer: 'Studio Ambar', date: '2026-09-11', status: 'Confirmado', items: [demoLine('CAB-008', 500, 9.7)] },
  { id: 'VTA-2083', customer: 'Camila Vargas', date: '2026-09-16', status: 'Confirmado', items: [demoLine('CAB-005', 250, 5.2)] },
];

const initialDebts: Debt[] = [
  { id: 'DEU-001', party: 'Salón Renueva', phone: '70112233', kind: 'Por cobrar', total: 4200, paid: 1800, date: '2026-08-28', dueDate: '2026-09-28', notes: 'Venta de cabello normal y premium.' },
  { id: 'DEU-002', party: 'Extensiones Mía', phone: '71223344', kind: 'Por cobrar', total: 3780, paid: 1500, date: '2026-09-17', dueDate: '2026-10-02', notes: 'Pago acordado en dos partes.' },
  { id: 'DEU-003', party: 'Studio Ambar', phone: '72334455', kind: 'Por cobrar', total: 4850, paid: 0, date: '2026-09-11', dueDate: '2026-09-20', notes: 'Crédito comercial.' },
  { id: 'DEU-004', party: 'Valentina Rojas', phone: '73445566', kind: 'Por cobrar', total: 3276, paid: 3276, date: '2026-09-21', dueDate: '2026-09-21', notes: 'Venta cancelada en su totalidad.' },
  { id: 'DEU-005', party: 'Select Hair Bolivia', phone: '73456712', kind: 'Por pagar', total: 8160, paid: 3000, date: '2026-09-05', dueDate: '2026-09-26', notes: 'Compra de cabello premium 60 cm.' },
  { id: 'DEU-006', party: 'Cabellos del Valle', phone: '71245890', kind: 'Por pagar', total: 4370, paid: 1000, date: '2026-09-02', dueDate: '2026-09-18', notes: 'Saldo de lote choco.' },
  { id: 'DEU-007', party: 'Mujeres del Altiplano', phone: '76543210', kind: 'Por pagar', total: 5180, paid: 5180, date: '2026-08-30', dueDate: '2026-09-15', notes: 'Compra liquidada.' },
];

@Injectable({ providedIn: 'root' })
export class DemoStore {
  readonly products = signal<Product[]>(initialProducts);
  readonly categories = signal<HairCategory[]>([...hairCategories]);
  readonly lengths = signal<HairLength[]>([...hairLengths]);
  readonly suppliers = signal<Supplier[]>(initialSuppliers);
  readonly orders = signal<Order[]>(initialOrders);
  readonly sales = signal<Sale[]>(initialSales);
  readonly debts = signal<Debt[]>(initialDebts);
  readonly query = signal('');
  readonly role = signal<Role>('admin');
  readonly displayName = signal('Vero');
  readonly storeName = signal('La Magia del Cabello');
  readonly storeAddress = signal('Av. Principal 123, La Paz, Bolivia');
  readonly storePhone = signal('70123456');
  readonly initialLots = openingLots(initialProducts, initialOrders, initialSales);
  readonly confirmedSales = computed(() => this.sales().filter(sale => sale.status === 'Confirmado'));
  readonly managedProducts = computed(() => this.products().filter(product => product.quantity > 0
    || this.orders().some(order => order.status === 'Confirmado' && order.items.some(item => item.productId === product.id))));
  readonly fifo = computed(() => calculateFifo(this.initialLots, this.orders(), this.sales()));
  readonly monthlySummaries = computed<MonthlySummary[]>(() => {
    const now = new Date();
    const costsBySale = new Map<string, number>();
    for (const allocation of this.fifo().allocations) costsBySale.set(allocation.saleId,
      (costsBySale.get(allocation.saleId) ?? 0) + allocation.quantity * allocation.unitCost);
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const purchases = this.orders().filter(order => order.status === 'Confirmado' && order.date.startsWith(key))
        .reduce((sum, order) => sum + operationValue(order.items), 0);
      const sales = this.confirmedSales().filter(sale => sale.date.startsWith(key))
        .reduce((sum, sale) => sum + operationValue(sale.items), 0);
      const costs = this.confirmedSales().filter(sale => sale.date.startsWith(key))
        .reduce((sum, sale) => sum + (costsBySale.get(sale.id) ?? 0), 0);
      return { key, label: new Intl.DateTimeFormat('es-BO', { month: 'short' }).format(date), purchases, sales, costs, profit: sales - costs };
    });
  });
  saleCost(saleId: string) { return this.fifo().allocations.filter(item => item.saleId === saleId).reduce((sum, item) => sum + item.quantity * item.unitCost, 0); }
  productSold(productId: string) { return this.confirmedSales().flatMap(sale => sale.items).filter(item => item.productId === productId).reduce((sum, item) => sum + item.quantity, 0); }
  productRevenue(productId: string) { return this.confirmedSales().flatMap(sale => sale.items).filter(item => item.productId === productId).reduce((sum, item) => sum + item.quantity * item.unitPrice, 0); }

  addCategory(value: string) {
    const category = value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-BO');
    if (!category) return 'Ingresa el nombre de la categoría.';
    if (this.categories().some(item => item.toLocaleLowerCase('es-BO') === category)) return 'Esa categoría ya existe.';
    this.categories.update(items => [...items, category]);
    this.addCombinations([category], this.lengths());
    return '';
  }
  addLength(value: number) {
    const length = Number(value);
    if (!Number.isInteger(length) || length <= 0) return 'Ingresa una longitud válida en centímetros.';
    if (this.lengths().includes(length)) return 'Esa longitud ya existe.';
    this.lengths.update(items => [...items, length].sort((a, b) => a - b));
    this.addCombinations(this.categories(), [length]);
    return '';
  }
  removeCategory(category: HairCategory) {
    if (this.categories().length <= 1) return 'Debe quedar al menos una categoría.';
    const products = this.products().filter(item => item.category === category);
    if (products.some(item => item.quantity !== 0 || item.sold !== 0 || this.hasMovements(item.id))) return 'No se puede quitar una categoría con stock o movimientos registrados.';
    this.products.update(items => items.filter(item => item.category !== category));
    this.categories.update(items => items.filter(item => item !== category));
    return '';
  }
  removeLength(length: HairLength) {
    if (this.lengths().length <= 1) return 'Debe quedar al menos una longitud.';
    const products = this.products().filter(item => item.length === length);
    if (products.some(item => item.quantity !== 0 || item.sold !== 0 || this.hasMovements(item.id))) return 'No se puede quitar una longitud con stock o movimientos registrados.';
    this.products.update(items => items.filter(item => item.length !== length));
    this.lengths.update(items => items.filter(item => item !== length));
    return '';
  }
  private hasMovements(productId: string) {
    return this.orders().some(order => order.items.some(item => item.productId === productId))
      || this.sales().some(sale => sale.items.some(item => item.productId === productId));
  }
  private addCombinations(categories: HairCategory[], lengths: HairLength[]) {
    let next = Math.max(0, ...this.products().map(item => Number(item.id.replace('CAB-', '')) || 0));
    const added: Product[] = [];
    for (const category of categories) for (const length of lengths) {
      if (this.products().some(item => item.category === category && item.length === length)) continue;
      added.push({ id: `CAB-${String(++next).padStart(3, '0')}`, name: productName(category, length), category, length,
        purchasePrice: 0, salePrice: 0, quantity: 0, threshold: 0, unit: 'g', color: '', quality: '', supplier: '', sold: 0 });
    }
    if (added.length) this.products.update(items => [...items, ...added]);
  }
  private prepareOrder(order: Order) {
    const added: Product[] = [];
    let next = Math.max(0, ...this.products().map(item => Number(item.id.replace('CAB-', '')) || 0));
    const items = order.items.map(line => {
      let product = [...this.products(), ...added].find(item => item.category === line.category && item.length === line.length);
      if (!product) {
        product = { id: `CAB-${String(++next).padStart(3, '0')}`, name: productName(line.category, line.length),
          category: line.category, length: line.length, purchasePrice: 0, salePrice: 0, quantity: 0,
          threshold: 0, unit: 'g', color: '', quality: '', supplier: '', sold: 0 };
        added.push(product);
      }
      return { ...line, productId: product.id };
    });
    return { order: { ...order, items }, added };
  }
  addSupplier(item: Supplier) { this.suppliers.update(items => [item, ...items]); }
  updateSupplier(item: Supplier) {
    const previous = this.suppliers().find(supplier => supplier.id === item.id);
    if (!previous) return false;
    const modifiedAt = new Date().toISOString();
    const updated = { ...item, modifiedAt };
    this.suppliers.update(items => items.map(supplier => supplier.id === item.id ? updated : supplier));
    if (previous.name !== updated.name) {
      this.products.update(items => items.map(product => product.supplier === previous.name ? { ...product, supplier: updated.name } : product));
      this.orders.update(items => items.map(order => order.supplier === previous.name ? { ...order, supplier: updated.name, modifiedAt } : order));
      this.debts.update(items => items.map(debt => debt.kind === 'Por pagar' && debt.party === previous.name ? { ...debt, party: updated.name } : debt));
    }
    return true;
  }
  removeSupplier(id: string) {
    const supplier = this.suppliers().find(item => item.id === id);
    if (!supplier) return 'No encontramos el proveedor que deseas eliminar.';
    if (this.orders().some(order => order.supplier === supplier.name)
      || this.debts().some(debt => debt.kind === 'Por pagar' && debt.party === supplier.name)
      || this.products().some(product => product.supplier === supplier.name && (product.quantity > 0 || product.sold > 0))) {
      return 'No se puede eliminar este proveedor porque aparece en compras, deudas o stock registrado.';
    }
    this.suppliers.update(items => items.filter(item => item.id !== id));
    return '';
  }
  addOrder(item: Order) {
    const prepared = this.prepareOrder(item);
    if (prepared.added.length) this.products.update(items => [...items, ...prepared.added]);
    if (prepared.order.status === 'Confirmado') this.applyPurchase(prepared.order.items);
    this.orders.update(items => [prepared.order, ...items]);
  }
  addSale(item: Sale, usePending = false): SaleResult {
    const assessment = this.assessSale(item.items);
    if (assessment.kind === 'error') return assessment;
    if (assessment.kind === 'insufficient') return assessment;
    if (assessment.kind === 'needs-pending' && !usePending) return assessment;
    const status = assessment.kind === 'needs-pending' ? 'Pendiente' : item.status;
    const saved = { ...item, status };
    if (status === 'Confirmado') {
      const shortage = calculateFifo(this.initialLots, this.orders(), [...this.sales(), saved]).shortages[0];
      if (shortage) return { kind: 'error', message: this.fifoShortageMessage(shortage.productId, shortage.quantity) };
    }
    if (status === 'Confirmado') this.applySale(saved.items);
    this.sales.update(items => [saved, ...items]);
    return { kind: 'saved', status };
  }
  updateOrder(item: Order) {
    const previous = this.orders().find(order => order.id === item.id);
    if (!previous) return 'No encontramos la compra que deseas editar.';
    const prepared = this.prepareOrder(item);
    const updated = prepared.order;
    for (const product of [...this.products(), ...prepared.added]) {
      const oldQuantity = previous.status === 'Confirmado' ? this.lineWeight(previous.items, product.id) : 0;
      const newQuantity = updated.status === 'Confirmado' ? this.lineWeight(updated.items, product.id) : 0;
      const physical = product.quantity + newQuantity - oldQuantity;
      const oldPending = previous.status === 'Pendiente' ? this.lineWeight(previous.items, product.id) : 0;
      const newPending = updated.status === 'Pendiente' ? this.lineWeight(updated.items, product.id) : 0;
      const incoming = this.pendingPurchaseWeight(product.id) + newPending - oldPending;
      if (physical < 0) return `No puedes reducir esta compra: faltaría stock físico de ${product.name}.`;
      if (physical + incoming < this.pendingSaleWeight(product.id)) return `Este cambio dejaría sin respaldo reservas de ${product.name}.`;
    }
    const candidateOrders = this.orders().map(order => order.id === item.id ? updated : order);
    const shortage = calculateFifo(this.initialLots, candidateOrders, this.sales()).shortages[0];
    if (shortage) return this.fifoShortageMessage(shortage.productId, shortage.quantity);
    this.products.update(products => [...products, ...prepared.added].map(product => {
      const oldQuantity = previous.status === 'Confirmado' ? this.lineWeight(previous.items, product.id) : 0;
      const newQuantity = updated.status === 'Confirmado' ? this.lineWeight(updated.items, product.id) : 0;
      return { ...product, quantity: product.quantity + newQuantity - oldQuantity };
    }));
    this.orders.update(orders => orders.map(order => order.id === item.id ? { ...updated, modifiedAt: new Date().toISOString() } : order));
    return '';
  }
  confirmOrder(id: string) {
    const order = this.orders().find(item => item.id === id);
    if (!order || order.status !== 'Pendiente') return 'La compra ya no está pendiente.';
    return this.updateOrder({ ...order, status: 'Confirmado' });
  }
  updateSale(item: Sale, usePending = false): SaleResult | { kind: 'error'; message: string } {
    const previous = this.sales().find(sale => sale.id === item.id);
    if (!previous) return { kind: 'error', message: 'No encontramos la venta que deseas editar.' };
    const assessment = this.assessSale(item.items, previous);
    if (assessment.kind === 'error') return assessment;
    if (assessment.kind === 'insufficient') return assessment;
    if (assessment.kind === 'needs-pending' && !usePending) return assessment;
    const status = assessment.kind === 'needs-pending' ? 'Pendiente' : item.status;
    if (status === 'Confirmado') {
      const candidateSales = this.sales().map(sale => sale.id === item.id ? { ...item, status } : sale);
      const shortage = calculateFifo(this.initialLots, this.orders(), candidateSales).shortages[0];
      if (shortage) return { kind: 'error', message: this.fifoShortageMessage(shortage.productId, shortage.quantity) };
    }
    this.products.update(products => products.map(product => {
      const oldQuantity = previous.status === 'Confirmado' ? this.lineWeight(previous.items, product.id) : 0;
      const newQuantity = status === 'Confirmado' ? this.lineWeight(item.items, product.id) : 0;
      return { ...product, quantity: product.quantity + oldQuantity - newQuantity, sold: product.sold - oldQuantity + newQuantity };
    }));
    this.sales.update(sales => sales.map(sale => sale.id === item.id ? { ...item, status, modifiedAt: new Date().toISOString() } : sale));
    return { kind: 'saved', status };
  }
  pendingPurchaseWeight(productId: string) {
    return this.orders().filter(order => order.status === 'Pendiente')
      .flatMap(order => order.items).filter(item => item.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  }
  pendingSaleWeight(productId: string) {
    return this.sales().filter(sale => sale.status === 'Pendiente')
      .flatMap(sale => sale.items).filter(item => item.productId === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  }
  sellableWeight(productId: string) {
    const product = this.products().find(item => item.id === productId);
    if (!product) return 0;
    return Math.max(0, Math.min(product.quantity, product.quantity + this.pendingPurchaseWeight(productId) - this.pendingSaleWeight(productId)));
  }
  availabilityStatus(product: Product) {
    return stockStatus({ ...product, quantity: this.sellableWeight(product.id) });
  }
  confirmSale(id: string) {
    const sale = this.sales().find(item => item.id === id);
    if (!sale || sale.status !== 'Pendiente') return 'La venta ya no está pendiente.';
    for (const item of sale.items) {
      const product = this.products().find(entry => entry.id === item.productId);
      if (!product || product.quantity < item.quantity) return `Aún no hay stock físico suficiente de ${productName(item.category, item.length)} para confirmar esta venta.`;
    }
    const result = this.updateSale({ ...sale, status: 'Confirmado' });
    return result.kind === 'saved' ? '' : result.kind === 'error' ? result.message : 'Esta venta aún depende de stock pendiente.';
  }
  private fifoShortageMessage(productId: string, missing: number) {
    const product = this.products().find(item => item.id === productId);
    return `La fecha de la venta requiere ${weight(missing)} de ${product?.name ?? 'cabello'} antes de que ingrese el lote correspondiente. Revisa las fechas de compra y venta.`;
  }
  private assessSale(items: HairLine[], previous?: Sale): SaleResult | { kind: 'ready' } {
    if (!items.length) return { kind: 'error', message: 'Agrega al menos un tipo de cabello a la venta.' };
    const shortages: SaleShortage[] = [];
    let pendingRequired: { kind: 'needs-pending'; product: Product; available: number; pending: number } | null = null;
    const used = new Set<string>();
    for (const item of items) {
      const product = this.products().find(entry => entry.id === item.productId);
      if (!product || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0) {
        return { kind: 'error', message: 'Hay un tipo de cabello, peso o precio inválido en la venta.' };
      }
      if (used.has(product.id)) return { kind: 'error', message: 'Cada tipo de cabello debe aparecer una sola vez en la venta.' };
      used.add(product.id);
      const pending = this.pendingPurchaseWeight(product.id);
      const reserved = this.pendingSaleWeight(product.id) - (previous?.status === 'Pendiente' ? this.lineWeight(previous.items, product.id) : 0);
      const physical = product.quantity + (previous?.status === 'Confirmado' ? this.lineWeight(previous.items, product.id) : 0);
      const available = Math.max(0, Math.min(physical, physical + pending - reserved));
      const backed = Math.max(0, physical + pending - reserved);
      if (item.quantity > backed) shortages.push({ product, requested: item.quantity, physical: available, pending: Math.max(0, backed - available), missing: item.quantity - backed });
      else if (item.quantity > available && !pendingRequired) pendingRequired = { kind: 'needs-pending', product, available, pending };
    }
    if (shortages.length) return { kind: 'insufficient', shortages };
    return pendingRequired ?? { kind: 'ready' };
  }
  private lineWeight(items: HairLine[], productId: string) {
    return items.filter(item => item.productId === productId).reduce((sum, item) => sum + item.quantity, 0);
  }
  private applyPurchase(items: HairLine[]) {
    this.products.update(products => products.map(product => {
      const quantity = items.filter(item => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
      return quantity ? { ...product, quantity: product.quantity + quantity } : product;
    }));
  }
  private applySale(items: HairLine[]) {
    this.products.update(products => products.map(product => {
      const quantity = items.filter(item => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
      return quantity ? { ...product, quantity: product.quantity - quantity, sold: product.sold + quantity } : product;
    }));
  }
  addDebt(item: Debt) { this.debts.update(items => [item, ...items]); }
  updateDebt(item: Debt) { this.debts.update(items => items.map(d => d.id === item.id ? item : d)); }
}

export const money = (value: number) => `Bs. ${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(value)}`;
export const weight = (grams: number) => grams >= 1000 ? `${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(grams / 1000)} kg` : `${new Intl.NumberFormat('es-BO').format(grams)} g`;
export const categoryLabel = (value: HairCategory) => value.charAt(0).toUpperCase() + value.slice(1);
export const productName = (category: HairCategory, length: HairLength) => `Cabello ${category} ${length} cm`;
export const operationName = (date: string, party: string) => `${dateLabel(date)} · ${party}`;
export const operationWeight = (items: HairLine[]) => items.reduce((sum, item) => sum + item.quantity, 0);
export const operationValue = (items: HairLine[]) => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
export const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
export const dateLabel = (value: string) => value ? new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : '—';
export const modifiedLabel = (value: string) => new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export const stockStatus = (product: Product) => product.quantity === 0 ? 'Agotado' : product.quantity <= product.threshold ? 'Stock bajo' : 'Disponible';
export const debtBalance = (debt: Debt) => Math.max(0, debt.total - debt.paid);
export const debtStatus = (debt: Debt): DebtStatus => {
  if (debtBalance(debt) === 0) return 'Pagada';
  if (debt.dueDate && debt.dueDate < todayLocal()) return 'Vencida';
  return debt.paid > 0 ? 'Parcial' : 'Pendiente';
};
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const content = [headers, ...rows].map(row => row.map(escape).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
