import { Injectable, signal } from '@angular/core';

export type Role = 'admin' | 'user';
export const hairCategories = ['normal', 'choco', 'tinturado', 'premium', 'elite'] as const;
export const hairLengths = [38, 40, 45, 50, 55, 60, 70, 80, 90, 100] as const;
export type HairCategory = typeof hairCategories[number];
export type HairLength = typeof hairLengths[number];

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
export type Supplier = { id: string; name: string; product: string; phone: string; email: string; returns: boolean; pending: number };
export type Order = { id: string; product: string; supplier: string; quantity: number; unit: 'g'; value: number; delivery: string; status: 'Pendiente' | 'Confirmado' | 'Recibido' | 'Retrasado' | 'Devuelto' };
export type Sale = { id: string; product: string; customer: string; quantity: number; value: number; cost: number; date: string };
export type DebtKind = 'Por cobrar' | 'Por pagar';
export type Debt = { id: string; party: string; phone: string; kind: DebtKind; total: number; paid: number; date: string; dueDate: string; notes: string };
export type DebtStatus = 'Pendiente' | 'Parcial' | 'Pagada' | 'Vencida';
export type MonthlySummary = { label: string; purchases: number; sales: number; profit: number };

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
  { id: 'PROV-001', name: 'Acopio Cochabamba', product: 'Cabello normal', phone: '70321456', email: 'acopio.cbba@ejemplo.bo', returns: true, pending: 1800 },
  { id: 'PROV-002', name: 'Cabellos del Valle', product: 'Cabello choco', phone: '71245890', email: 'valle@ejemplo.bo', returns: true, pending: 950 },
  { id: 'PROV-003', name: 'Acopio Oriental', product: 'Cabello tinturado', phone: '72134678', email: 'oriental@ejemplo.bo', returns: false, pending: 1200 },
  { id: 'PROV-004', name: 'Select Hair Bolivia', product: 'Cabello premium', phone: '73456712', email: 'select@ejemplo.bo', returns: true, pending: 2100 },
  { id: 'PROV-005', name: 'Mujeres del Altiplano', product: 'Cabello elite', phone: '76543210', email: 'altiplano@ejemplo.bo', returns: true, pending: 700 },
];

const initialOrders: Order[] = [
  { id: 'COMP-1046', product: 'Cabello normal 38 cm', supplier: 'Acopio Cochabamba', quantity: 1800, unit: 'g', value: 3960, delivery: '2026-09-25', status: 'Confirmado' },
  { id: 'COMP-1045', product: 'Cabello premium 60 cm', supplier: 'Select Hair Bolivia', quantity: 1200, unit: 'g', value: 8160, delivery: '2026-09-24', status: 'Pendiente' },
  { id: 'COMP-1044', product: 'Cabello choco 55 cm', supplier: 'Cabellos del Valle', quantity: 950, unit: 'g', value: 4370, delivery: '2026-09-20', status: 'Retrasado' },
  { id: 'COMP-1043', product: 'Cabello elite 55 cm', supplier: 'Mujeres del Altiplano', quantity: 700, unit: 'g', value: 5180, delivery: '2026-09-18', status: 'Recibido' },
  { id: 'COMP-1042', product: 'Cabello tinturado 45 cm', supplier: 'Acopio Oriental', quantity: 1200, unit: 'g', value: 4320, delivery: '2026-09-15', status: 'Recibido' },
  { id: 'COMP-1041', product: 'Cabello elite 80 cm', supplier: 'Mujeres del Altiplano', quantity: 450, unit: 'g', value: 4770, delivery: '2026-09-12', status: 'Devuelto' },
];

const initialSales: Sale[] = [
  { id: 'VTA-2088', product: 'Cabello premium 50 cm', customer: 'Valentina Rojas', quantity: 420, value: 3276, cost: 2268, date: '2026-09-21' },
  { id: 'VTA-2087', product: 'Cabello normal 38 cm', customer: 'Salón Renueva', quantity: 600, value: 1920, cost: 1320, date: '2026-09-19' },
  { id: 'VTA-2086', product: 'Cabello elite 55 cm', customer: 'Extensiones Mía', quantity: 350, value: 3780, cost: 2590, date: '2026-09-17' },
  { id: 'VTA-2085', product: 'Cabello choco 40 cm', customer: 'Mariela Flores', quantity: 300, value: 1350, cost: 930, date: '2026-09-14' },
  { id: 'VTA-2084', product: 'Cabello premium 60 cm', customer: 'Studio Ambar', quantity: 500, value: 4850, cost: 3400, date: '2026-09-11' },
  { id: 'VTA-2083', product: 'Cabello tinturado 45 cm', customer: 'Camila Vargas', quantity: 250, value: 1300, cost: 900, date: '2026-09-08' },
  { id: 'VTA-2082', product: 'Cabello normal 45 cm', customer: 'Salón Renueva', quantity: 280, value: 1148, cost: 784, date: '2026-09-03' },
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

export const monthlySummaries: MonthlySummary[] = [
  { label: 'Abr', purchases: 18400, sales: 25700, profit: 7300 },
  { label: 'May', purchases: 22600, sales: 31800, profit: 9200 },
  { label: 'Jun', purchases: 19700, sales: 28600, profit: 8900 },
  { label: 'Jul', purchases: 25300, sales: 36100, profit: 10800 },
  { label: 'Ago', purchases: 29100, sales: 42400, profit: 13300 },
  { label: 'Sep', purchases: 26760, sales: 35850, profit: 9090 },
];

@Injectable({ providedIn: 'root' })
export class DemoStore {
  readonly products = signal<Product[]>(initialProducts);
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

  addProduct(item: Product) { this.products.update(items => [item, ...items]); }
  updateProduct(item: Product) { this.products.update(items => items.map(p => p.id === item.id ? item : p)); }
  addSupplier(item: Supplier) { this.suppliers.update(items => [item, ...items]); }
  addOrder(item: Order) { this.orders.update(items => [item, ...items]); }
  addDebt(item: Debt) { this.debts.update(items => [item, ...items]); }
  updateDebt(item: Debt) { this.debts.update(items => items.map(d => d.id === item.id ? item : d)); }
}

export const money = (value: number) => `Bs. ${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(value)}`;
export const weight = (grams: number) => grams >= 1000 ? `${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(grams / 1000)} kg` : `${new Intl.NumberFormat('es-BO').format(grams)} g`;
export const categoryLabel = (value: HairCategory) => value.charAt(0).toUpperCase() + value.slice(1);
export const productName = (category: HairCategory, length: HairLength) => `Cabello ${category} ${length} cm`;
export const dateLabel = (value: string) => value ? new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : '—';
export const stockStatus = (product: Product) => product.quantity === 0 ? 'Agotado' : product.quantity <= product.threshold ? 'Stock bajo' : 'Disponible';
export const debtBalance = (debt: Debt) => Math.max(0, debt.total - debt.paid);
export const debtStatus = (debt: Debt): DebtStatus => {
  if (debtBalance(debt) === 0) return 'Pagada';
  if (debt.dueDate && debt.dueDate < new Date().toISOString().slice(0, 10)) return 'Vencida';
  return debt.paid > 0 ? 'Parcial' : 'Pendiente';
};
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const content = [headers, ...rows].map(row => row.map(escape).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
