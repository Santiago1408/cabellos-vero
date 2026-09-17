import { Injectable, signal } from '@angular/core';

export type Role = 'admin' | 'user';
export type Product = { id: string; name: string; category: string; price: number; quantity: number; threshold: number; unit: string; expiry: string; supplier: string; sold: number };
export type Supplier = { id: string; name: string; product: string; phone: string; email: string; returns: boolean; pending: number };
export type Order = { id: string; product: string; supplier: string; quantity: number; unit: string; value: number; delivery: string; status: 'Pendiente' | 'Confirmado' | 'Recibido' | 'Retrasado' | 'Devuelto' };

const initialProducts: Product[] = [
  { id: 'PRO-001', name: 'Shampoo hidratante', category: 'Cuidado capilar', price: 48, quantity: 43, threshold: 12, unit: 'unid.', expiry: '2027-11-12', supplier: 'Distribuidora Belleza', sold: 30 },
  { id: 'PRO-002', name: 'Acondicionador nutritivo', category: 'Cuidado capilar', price: 52, quantity: 22, threshold: 12, unit: 'unid.', expiry: '2027-12-21', supplier: 'Distribuidora Belleza', sold: 21 },
  { id: 'PRO-003', name: 'Mascarilla reparadora', category: 'Tratamientos', price: 85, quantity: 36, threshold: 9, unit: 'unid.', expiry: '2028-02-05', supplier: 'Cosmética Andina', sold: 19 },
  { id: 'PRO-004', name: 'Tinte castaño oscuro', category: 'Coloración', price: 39, quantity: 14, threshold: 6, unit: 'unid.', expiry: '2028-03-08', supplier: 'Color Pro', sold: 17 },
  { id: 'PRO-005', name: 'Tinte rubio ceniza', category: 'Coloración', price: 39, quantity: 5, threshold: 8, unit: 'unid.', expiry: '2028-03-09', supplier: 'Color Pro', sold: 15 },
  { id: 'PRO-006', name: 'Cepillo térmico', category: 'Accesorios', price: 72, quantity: 10, threshold: 5, unit: 'unid.', expiry: '', supplier: 'Accesorios Vero', sold: 13 },
  { id: 'PRO-007', name: 'Aceite de argán', category: 'Tratamientos', price: 95, quantity: 3, threshold: 7, unit: 'unid.', expiry: '2027-09-15', supplier: 'Cosmética Andina', sold: 12 },
  { id: 'PRO-008', name: 'Laca fijadora', category: 'Peinado', price: 44, quantity: 26, threshold: 8, unit: 'unid.', expiry: '2028-07-06', supplier: 'Distribuidora Belleza', sold: 11 },
  { id: 'PRO-009', name: 'Gorro de satén', category: 'Accesorios', price: 28, quantity: 0, threshold: 10, unit: 'unid.', expiry: '', supplier: 'Accesorios Vero', sold: 9 },
  { id: 'PRO-010', name: 'Protector térmico', category: 'Peinado', price: 68, quantity: 41, threshold: 10, unit: 'unid.', expiry: '2028-11-11', supplier: 'Cosmética Andina', sold: 8 },
];
const initialSuppliers: Supplier[] = [
  { id: 'SUP-001', name: 'Distribuidora Belleza', product: 'Shampoo y acondicionador', phone: '70123456', email: 'ventas@belleza.bo', returns: true, pending: 13 },
  { id: 'SUP-002', name: 'Cosmética Andina', product: 'Tratamientos', phone: '71234567', email: 'contacto@andina.bo', returns: true, pending: 8 },
  { id: 'SUP-003', name: 'Color Pro', product: 'Tintes', phone: '72345678', email: 'pedidos@colorpro.bo', returns: false, pending: 6 },
  { id: 'SUP-004', name: 'Accesorios Vero', product: 'Accesorios', phone: '73456789', email: 'hola@accesorios.bo', returns: true, pending: 0 },
];
const initialOrders: Order[] = [
  { id: 'PED-1042', product: 'Shampoo hidratante', supplier: 'Distribuidora Belleza', quantity: 24, unit: 'unid.', value: 1152, delivery: '2026-09-20', status: 'Confirmado' },
  { id: 'PED-1041', product: 'Tinte rubio ceniza', supplier: 'Color Pro', quantity: 20, unit: 'unid.', value: 780, delivery: '2026-09-19', status: 'Pendiente' },
  { id: 'PED-1040', product: 'Aceite de argán', supplier: 'Cosmética Andina', quantity: 12, unit: 'unid.', value: 1140, delivery: '2026-09-14', status: 'Retrasado' },
  { id: 'PED-1039', product: 'Cepillo térmico', supplier: 'Accesorios Vero', quantity: 16, unit: 'unid.', value: 1152, delivery: '2026-09-12', status: 'Recibido' },
  { id: 'PED-1038', product: 'Mascarilla reparadora', supplier: 'Cosmética Andina', quantity: 8, unit: 'unid.', value: 680, delivery: '2026-09-10', status: 'Devuelto' },
];

@Injectable({ providedIn: 'root' })
export class DemoStore {
  readonly products = signal<Product[]>(initialProducts);
  readonly suppliers = signal<Supplier[]>(initialSuppliers);
  readonly orders = signal<Order[]>(initialOrders);
  readonly query = signal('');
  readonly role = signal<Role>('admin');
  readonly displayName = signal('María Vero');
  readonly storeName = signal('Cabellos Vero');
  readonly storeAddress = signal('Av. Principal 123, La Paz, Bolivia');
  readonly storePhone = signal('70123456');

  addProduct(item: Product) { this.products.update(items => [item, ...items]); }
  updateProduct(item: Product) { this.products.update(items => items.map(p => p.id === item.id ? item : p)); }
  addSupplier(item: Supplier) { this.suppliers.update(items => [item, ...items]); }
  addOrder(item: Order) { this.orders.update(items => [item, ...items]); }
}

export const money = (value: number) => `Bs. ${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(value)}`;
export const dateLabel = (value: string) => value ? new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : '—';
export const stockStatus = (product: Product) => product.quantity === 0 ? 'Agotado' : product.quantity <= product.threshold ? 'Stock bajo' : 'Disponible';
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const content = [headers, ...rows].map(row => row.map(escape).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
