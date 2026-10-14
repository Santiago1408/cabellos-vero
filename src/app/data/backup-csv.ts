import { DemoStore, csvContent, downloadBlob, todayLocal } from './demo-store';

/** Exportación versionada del estado del prototipo para una futura importación. */
export async function downloadCompleteBackup(store: DemoStore, passphrase: string) {
  if (store.role() !== 'admin') return;

  const rows: (string | number)[][] = [];
  const add = (type: string, id: string, value: unknown) => rows.push([type, id, JSON.stringify(value)]);
  const counts = {
    categories: store.categories().length,
    lengths: store.lengths().length,
    openingLots: store.initialLots.length,
    products: store.products().length,
    suppliers: store.suppliers().length,
    purchases: store.orders().length,
    sales: store.sales().length,
    debts: store.debts().length,
    employees: store.employees().length,
    costAllocations: store.fifo().allocations.length,
    costShortages: store.fifo().shortages.length,
  };

  add('manifest', 'backup', {
    format: 'la-magia-del-cabello-csv', version: 1, exportedAt: new Date().toISOString(),
    currency: 'BOB', weightUnit: 'g', businessTimeZone: 'America/La_Paz', counts,
    note: 'Los empleados se exportan sin contraseñas. Este archivo no sustituye el respaldo de PostgreSQL.',
  });
  add('settings', 'main', {
    storeName: store.storeName(), storeAddress: store.storeAddress(), storePhone: store.storePhone(),
    adminDisplayName: store.adminDisplayName(),
  });
  store.categories().forEach(category => add('category', category, { name: category }));
  store.lengths().forEach(length => add('length', String(length), { centimeters: length }));
  store.initialLots.forEach((lot, index) => add('opening-lot', `${lot.productId}:${index}`, lot));
  store.products().forEach(product => add('product', product.id, product));
  store.suppliers().forEach(supplier => add('supplier', supplier.id, supplier));
  store.orders().forEach(order => add('purchase', order.id, order));
  store.sales().forEach(sale => add('sale', sale.id, sale));
  store.debts().forEach(debt => add('debt', debt.id, debt));
  store.employees().forEach(employee => add('employee', employee.id, employee));
  store.fifo().allocations.forEach((allocation, index) => add('cost-allocation', String(index + 1), allocation));
  store.fifo().shortages.forEach((shortage, index) => add('cost-shortage', String(index + 1), shortage));

  const csv = csvContent(['Tipo de registro', 'Identificador', 'Datos completos JSON'], rows);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header = new TextEncoder().encode('LMCB1');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  );
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, new TextEncoder().encode(csv));
  downloadBlob(`respaldo-completo-cabello-${todayLocal()}.csv.enc`, new Blob([header, salt, iv, encrypted], { type: 'application/octet-stream' }));
}
