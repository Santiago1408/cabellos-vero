import { computed, Injectable, signal } from '@angular/core';
import { calculateFifo, openingLots } from './fifo';
import { amountCents, hasTwoDecimalPlaces, lineValue, sumMoney } from './money';

export { lineValue } from './money';

export type Role = 'admin' | 'employee';
export type EmployeeSnapshot = { fullName: string; username: string; ci: string; birthDate: string; phone: string; active: boolean };
export type EmployeeChange = { at: string; action: 'Creación' | 'Edición' | 'Desactivación' | 'Reactivación' | 'Contraseña restablecida' | 'Contraseña cambiada'; before?: EmployeeSnapshot; after: EmployeeSnapshot };
export type Employee = EmployeeSnapshot & { id: string; createdAt: string; modifiedAt?: string; changes: EmployeeChange[] };
export type EmployeeInput = Omit<EmployeeSnapshot, 'active'> & { password: string };
export const demoAdminCredentials = { username: 'admin', password: 'CabelloDemo2026!' } as const;
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
export type OperationStatus = 'Pendiente' | 'Confirmado' | 'Anulada';
export type HairLine = { productId: string; category: HairCategory; length: HairLength; quantity: number; unitPrice: number };
export type FulfillmentSnapshot = { at: string; items: { productId: string; quantity: number }[] };
export type FulfillmentChange = { at: string; reason: string; before: FulfillmentSnapshot; after: FulfillmentSnapshot };
export type Fulfillment = FulfillmentSnapshot & { id: string; recordedAt?: string; voidedAt?: string; changes?: FulfillmentChange[] };
export type OperationPaymentMethod = 'Efectivo' | 'QR' | 'Transferencia' | 'Otro';
export type OperationPaymentSnapshot = { date: string; amount: number; method: OperationPaymentMethod; reference: string };
export type OperationPaymentState = OperationPaymentSnapshot & { voided: boolean };
export type OperationPaymentChange = { at: string; reason: string; before: OperationPaymentState; after: OperationPaymentState };
export type OperationPayment = OperationPaymentSnapshot & { id: string; voidedAt?: string; changes?: OperationPaymentChange[] };
export type OperationSnapshot = { party: string; date: string; effectiveDate?: string; confirmedAt?: string; status: OperationStatus; items: HairLine[] };
export type OperationChange = { at: string; reason: 'Edición' | 'Confirmación' | 'Anulación' | 'Proveedor actualizado'; note?: string; before: OperationSnapshot; after: OperationSnapshot };
export type Order = { id: string; supplier: string; date: string; effectiveDate?: string; confirmedAt?: string; status: OperationStatus; items: HairLine[]; fulfillments?: Fulfillment[]; payments?: OperationPayment[]; modifiedAt?: string; cancelledAt?: string; changeHistory?: OperationChange[] };
export type Sale = { id: string; customer: string; date: string; effectiveDate?: string; confirmedAt?: string; status: OperationStatus; items: HairLine[]; fulfillments?: Fulfillment[]; payments?: OperationPayment[]; modifiedAt?: string; cancelledAt?: string; changeHistory?: OperationChange[] };
export type SaleShortage = { product: Product; requested: number; physical: number; pending: number; missing: number };
export type SaleResult = { kind: 'saved'; status: OperationStatus }
  | { kind: 'needs-pending'; product: Product; available: number; pending: number }
  | { kind: 'insufficient'; shortages: SaleShortage[] }
  | { kind: 'error'; message: string };
export type DebtKind = 'Por cobrar' | 'Por pagar';
export type DebtPaymentSnapshot = { date: string; amount: number; note: string; voided: boolean };
export type DebtPaymentChange = { at: string; reason: 'Corrección' | 'Anulación'; before: DebtPaymentSnapshot; after: DebtPaymentSnapshot };
export type DebtPayment = { id: string; date: string; amount: number; note: string; voidedAt?: string; changes?: DebtPaymentChange[] };
export type DebtSnapshot = { party: string; phone: string; kind: DebtKind; total: number; date: string; dueDate: string; notes: string };
export type DebtChange = { at: string; before: DebtSnapshot; after: DebtSnapshot };
export type Debt = DebtSnapshot & { id: string; payments: DebtPayment[]; changeHistory?: DebtChange[] };
export type DebtStatus = 'Pendiente' | 'Parcial' | 'Pagada' | 'Vencida';
export type MonthlySummary = { key: string; label: string; purchases: number; sales: number; costs: number; profit: number };

const backupReminderKey = 'lmc-backup-reminder-v1';
const readBackupReminder = (): { intervalDays: number; lastBackupAt: string | null } => {
  if (typeof localStorage === 'undefined') return { intervalDays: 7, lastBackupAt: null };
  try {
    const saved = JSON.parse(localStorage.getItem(backupReminderKey) ?? '{}') as { intervalDays?: unknown; lastBackupAt?: unknown };
    return {
      intervalDays: Number.isInteger(saved.intervalDays) && Number(saved.intervalDays) >= 1 && Number(saved.intervalDays) <= 365
        ? Number(saved.intervalDays) : 7,
      lastBackupAt: typeof saved.lastBackupAt === 'string' && Number.isFinite(Date.parse(saved.lastBackupAt))
        ? saved.lastBackupAt : null,
    };
  } catch { return { intervalDays: 7, lastBackupAt: null }; }
};

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

const operationSnapshot = (item: Order | Sale): OperationSnapshot => ({
  party: 'supplier' in item ? item.supplier : item.customer,
  date: item.date,
  effectiveDate: item.status === 'Confirmado' ? operationEffectiveDate(item) : undefined,
  confirmedAt: item.status === 'Confirmado' && !item.fulfillments?.length ? item.confirmedAt : undefined,
  status: item.status,
  items: item.items.map(line => ({ ...line })),
});

const operationChange = (before: Order | Sale, after: Order | Sale, reason: OperationChange['reason'], at: string, note?: string): OperationChange | null => {
  const previous = operationSnapshot(before);
  const next = operationSnapshot(after);
  return JSON.stringify(previous) === JSON.stringify(next) ? null : { at, reason, note, before: previous, after: next };
};

const paymentSnapshot = (payment: DebtPayment): DebtPaymentSnapshot => ({
  date: payment.date, amount: payment.amount, note: payment.note, voided: !!payment.voidedAt,
});

const debtSnapshot = (debt: Debt): DebtSnapshot => ({
  party: debt.party, phone: debt.phone, kind: debt.kind, total: debt.total,
  date: debt.date, dueDate: debt.dueDate, notes: debt.notes,
});

const employeeSnapshot = (employee: Employee): EmployeeSnapshot => ({
  fullName: employee.fullName, username: employee.username, ci: employee.ci,
  birthDate: employee.birthDate, phone: employee.phone, active: employee.active,
});

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
  { id: 'DEU-001', party: 'Ana Quispe', phone: '70112233', kind: 'Por cobrar', total: 4200, payments: [{ id: 'PAG-001-1', date: '2026-09-05', amount: 1000, note: 'Primer abono' }, { id: 'PAG-001-2', date: '2026-09-20', amount: 800, note: 'Segundo abono' }], date: '2026-08-28', dueDate: '2026-09-28', notes: 'Préstamo personal entregado.' },
  { id: 'DEU-002', party: 'Marco Salinas', phone: '71223344', kind: 'Por cobrar', total: 3780, payments: [{ id: 'PAG-002-1', date: '2026-09-20', amount: 1000, note: '' }, { id: 'PAG-002-2', date: '2026-09-27', amount: 500, note: '' }], date: '2026-09-17', dueDate: '2026-10-02', notes: 'Devolución acordada en dos partes.' },
  { id: 'DEU-003', party: 'Julia Méndez', phone: '72334455', kind: 'Por cobrar', total: 4850, payments: [], date: '2026-09-11', dueDate: '2026-09-20', notes: 'Dinero prestado.' },
  { id: 'DEU-004', party: 'David Rojas', phone: '73445566', kind: 'Por cobrar', total: 3276, payments: [{ id: 'PAG-004-1', date: '2026-09-21', amount: 3276, note: 'Liquidación total' }], date: '2026-09-21', dueDate: '2026-09-21', notes: 'Préstamo devuelto en su totalidad.' },
  { id: 'DEU-005', party: 'Lucía Vargas', phone: '73456712', kind: 'Por pagar', total: 8160, payments: [{ id: 'PAG-005-1', date: '2026-09-12', amount: 3000, note: '' }], date: '2026-09-05', dueDate: '2026-09-26', notes: 'Préstamo personal recibido.' },
  { id: 'DEU-006', party: 'Rosa Flores', phone: '71245890', kind: 'Por pagar', total: 4370, payments: [{ id: 'PAG-006-1', date: '2026-09-10', amount: 1000, note: '' }], date: '2026-09-02', dueDate: '2026-09-18', notes: 'Devolución de dinero pendiente.' },
  { id: 'DEU-007', party: 'Jorge Ibáñez', phone: '76543210', kind: 'Por pagar', total: 5180, payments: [{ id: 'PAG-007-1', date: '2026-09-10', amount: 5180, note: 'Liquidación total' }], date: '2026-08-30', dueDate: '2026-09-15', notes: 'Préstamo liquidado.' },
];

@Injectable({ providedIn: 'root' })
export class DemoStore {
  private readonly employeePasswords = new Map<string, string>();
  private readonly temporaryPasswordIds = signal<ReadonlySet<string>>(new Set());
  readonly employees = signal<Employee[]>([]);
  readonly session = signal<{ role: Role; employeeId?: string } | null>(null);
  readonly currentEmployee = computed(() => this.employees().find(item => item.id === this.session()?.employeeId && item.active));
  readonly role = computed<Role | null>(() => {
    const session = this.session();
    if (session?.role === 'admin') return 'admin';
    return session?.role === 'employee' && this.currentEmployee() ? 'employee' : null;
  });
  readonly adminDisplayName = signal('Administrador');
  readonly displayName = computed(() => this.role() === 'admin' ? this.adminDisplayName() : this.currentEmployee()?.fullName ?? '');
  readonly currentUsername = computed(() => this.role() === 'admin' ? demoAdminCredentials.username : this.currentEmployee()?.username ?? '');
  readonly mustChangePassword = computed(() => {
    const employee = this.role() === 'employee' ? this.currentEmployee() : undefined;
    return !!employee && this.temporaryPasswordIds().has(employee.id);
  });
  readonly products = signal<Product[]>(initialProducts);
  readonly categories = signal<HairCategory[]>([...hairCategories]);
  readonly lengths = signal<HairLength[]>([...hairLengths]);
  readonly suppliers = signal<Supplier[]>(initialSuppliers);
  readonly orders = signal<Order[]>(initialOrders);
  readonly sales = signal<Sale[]>(initialSales);
  readonly debts = signal<Debt[]>(initialDebts);
  readonly query = signal('');
  readonly storeName = signal('La Magia del Cabello');
  readonly storeAddress = signal('Av. Principal 123, La Paz, Bolivia');
  readonly storePhone = signal('70123456');
  readonly backupIntervalDays = signal(readBackupReminder().intervalDays);
  readonly lastBackupAt = signal<string | null>(readBackupReminder().lastBackupAt);
  readonly pendingBackupAt = signal<string | null>(null);
  readonly nextBackupAt = computed(() => {
    const last = this.lastBackupAt();
    return last ? new Date(Date.parse(last) + this.backupIntervalDays() * 24 * 60 * 60 * 1000).toISOString() : null;
  });
  readonly initialLots = openingLots(initialProducts, initialOrders, initialSales);
  readonly confirmedSales = computed(() => this.sales().filter(sale => fulfilledWeight(sale) > 0));
  readonly managedProducts = computed(() => this.products().filter(product => product.quantity > 0
    || this.orders().some(order => fulfilledQuantity(order, product.id) > 0)));
  readonly fifo = computed(() => calculateFifo(this.initialLots, this.orders(), this.sales()));
  private saveBackupReminder() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(backupReminderKey, JSON.stringify({
        intervalDays: this.backupIntervalDays(), lastBackupAt: this.lastBackupAt(),
      }));
    } catch { /* La configuración sigue disponible durante esta sesión. */ }
  }
  backupDue(now = Date.now()) {
    const next = this.nextBackupAt();
    return this.role() === 'admin' && (!next || now >= Date.parse(next));
  }
  setBackupIntervalDays(days: number) {
    if (this.role() !== 'admin') return 'Solo el administrador puede cambiar la frecuencia de respaldos.';
    if (!Number.isInteger(days) || days < 1 || days > 365) return 'Ingresa un número entero de días entre 1 y 365.';
    this.backupIntervalDays.set(days);
    this.saveBackupReminder();
    return '';
  }
  noteBackupDownloaded() {
    if (this.role() === 'admin') this.pendingBackupAt.set(new Date().toISOString());
  }
  confirmBackupSaved() {
    if (this.role() !== 'admin' || !this.pendingBackupAt()) return;
    this.lastBackupAt.set(this.pendingBackupAt());
    this.pendingBackupAt.set(null);
    this.saveBackupReminder();
  }
  login(username: string, password: string) {
    const normalized = username.trim().toLocaleLowerCase('es-BO');
    if (normalized === demoAdminCredentials.username && password === demoAdminCredentials.password) {
      this.session.set({ role: 'admin' });
      return true;
    }
    const employee = this.employees().find(item => item.active && item.username.toLocaleLowerCase('es-BO') === normalized);
    if (!employee || this.employeePasswords.get(employee.id) !== password) return false;
    this.session.set({ role: 'employee', employeeId: employee.id });
    return true;
  }
  logout() { this.session.set(null); }
  renameAdmin(value: string) {
    if (this.role() !== 'admin' || !value.trim()) return;
    this.adminDisplayName.set(value.trim());
  }
  private employeeError(input: Omit<EmployeeInput, 'password'>, editingId?: string) {
    if (!input.fullName.trim() || !input.username.trim() || !input.ci.trim() || !input.birthDate || !input.phone.trim()) {
      return 'Completa el nombre, usuario, CI, fecha de nacimiento y celular.';
    }
    if (/\s/.test(input.username.trim())) return 'El nombre de usuario no puede contener espacios.';
    if (this.employees().some(item => item.id !== editingId && item.username.toLocaleLowerCase('es-BO') === input.username.trim().toLocaleLowerCase('es-BO'))
      || input.username.trim().toLocaleLowerCase('es-BO') === demoAdminCredentials.username) return 'Ese nombre de usuario ya está en uso.';
    if (this.employees().some(item => item.id !== editingId && item.ci.toLocaleLowerCase('es-BO') === input.ci.trim().toLocaleLowerCase('es-BO'))) return 'Ese CI ya está registrado.';
    const birthDate = new Date(`${input.birthDate}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate) || Number.isNaN(birthDate.getTime())
      || birthDate.toISOString().slice(0, 10) !== input.birthDate || input.birthDate > todayLocal()) return 'Ingresa una fecha de nacimiento válida, no posterior a hoy.';
    return '';
  }
  addEmployee(input: EmployeeInput) {
    if (this.role() !== 'admin') return 'Solo el administrador puede gestionar empleados.';
    const error = this.employeeError(input);
    if (error) return error;
    if (input.password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    const id = `EMP-${String(Math.max(0, ...this.employees().map(item => Number(item.id.split('-')[1]) || 0)) + 1).padStart(3, '0')}`;
    const now = new Date().toISOString();
    const employee: Employee = {
      id, fullName: input.fullName.trim(), username: input.username.trim(), ci: input.ci.trim(),
      birthDate: input.birthDate, phone: input.phone.trim(), active: true, createdAt: now, changes: [],
    };
    employee.changes.push({ at: now, action: 'Creación', after: employeeSnapshot(employee) });
    this.employeePasswords.set(id, input.password);
    this.temporaryPasswordIds.update(ids => new Set([...ids, id]));
    this.employees.update(items => [employee, ...items]);
    return '';
  }
  updateEmployee(id: string, input: Omit<EmployeeInput, 'password'>) {
    if (this.role() !== 'admin') return 'Solo el administrador puede gestionar empleados.';
    const previous = this.employees().find(item => item.id === id);
    if (!previous) return 'No encontramos al empleado.';
    const error = this.employeeError(input, id);
    if (error) return error;
    const after: EmployeeSnapshot = {
      fullName: input.fullName.trim(), username: input.username.trim(), ci: input.ci.trim(),
      birthDate: input.birthDate, phone: input.phone.trim(), active: previous.active,
    };
    const before = employeeSnapshot(previous);
    if (JSON.stringify(before) === JSON.stringify(after)) return '';
    const at = new Date().toISOString();
    const change: EmployeeChange = { at, action: 'Edición', before, after };
    this.employees.update(items => items.map(item => item.id === id
      ? { ...item, ...after, modifiedAt: at, changes: [...item.changes, change] } : item));
    return '';
  }
  setEmployeeActive(id: string, active: boolean) {
    if (this.role() !== 'admin') return 'Solo el administrador puede gestionar empleados.';
    const previous = this.employees().find(item => item.id === id);
    if (!previous) return 'No encontramos al empleado.';
    if (previous.active === active) return active ? 'La cuenta ya está activa.' : 'La cuenta ya está desactivada.';
    const at = new Date().toISOString();
    const before = employeeSnapshot(previous);
    const after = { ...before, active };
    const change: EmployeeChange = { at, action: active ? 'Reactivación' : 'Desactivación', before, after };
    this.employees.update(items => items.map(item => item.id === id
      ? { ...item, active, modifiedAt: at, changes: [...item.changes, change] } : item));
    return '';
  }
  resetEmployeePassword(id: string, password: string) {
    if (this.role() !== 'admin') return 'Solo el administrador puede gestionar empleados.';
    const previous = this.employees().find(item => item.id === id);
    if (!previous) return 'No encontramos al empleado.';
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (this.employeePasswords.get(id) === password) return 'La nueva contraseña debe ser diferente de la actual.';
    const at = new Date().toISOString();
    const snapshot = employeeSnapshot(previous);
    const change: EmployeeChange = { at, action: 'Contraseña restablecida', before: snapshot, after: snapshot };
    this.employeePasswords.set(id, password);
    this.temporaryPasswordIds.update(ids => new Set([...ids, id]));
    this.employees.update(items => items.map(item => item.id === id
      ? { ...item, modifiedAt: at, changes: [...item.changes, change] } : item));
    return '';
  }
  changeOwnEmployeePassword(currentPassword: string, newPassword: string) {
    const employee = this.role() === 'employee' ? this.currentEmployee() : undefined;
    if (!employee) return 'Debes iniciar sesión como empleado para cambiar tu contraseña.';
    if (this.employeePasswords.get(employee.id) !== currentPassword) return 'La contraseña actual no es correcta.';
    if (newPassword.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres.';
    if (newPassword === currentPassword) return 'La nueva contraseña debe ser diferente de la actual.';
    const at = new Date().toISOString();
    const snapshot = employeeSnapshot(employee);
    const change: EmployeeChange = { at, action: 'Contraseña cambiada', before: snapshot, after: snapshot };
    this.employeePasswords.set(employee.id, newPassword);
    this.temporaryPasswordIds.update(ids => {
      const next = new Set(ids);
      next.delete(employee.id);
      return next;
    });
    this.employees.update(items => items.map(item => item.id === employee.id
      ? { ...item, modifiedAt: at, changes: [...item.changes, change] } : item));
    return '';
  }
  readonly monthlySummaries = computed<MonthlySummary[]>(() => {
    const [year, month] = todayLocal().split('-').map(Number);
    const costsByEvent = new Map<string, number>();
    for (const allocation of this.fifo().allocations) costsByEvent.set(allocation.saleEventId,
      sumMoney([costsByEvent.get(allocation.saleEventId) ?? 0, allocation.cost]));
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(Date.UTC(year, month - 1 - 5 + index, 1));
      const key = date.toISOString().slice(0, 7);
      const purchases = this.orders().flatMap(order => operationEvents(order)
        .filter(event => eventDate(event).startsWith(key)).map(event => eventValue(order, event)));
      const sales = this.sales().flatMap(sale => operationEvents(sale)
        .filter(event => eventDate(event).startsWith(key)).map(event => eventValue(sale, event)));
      const costs = this.sales().flatMap(sale => operationEvents(sale)
        .filter(event => eventDate(event).startsWith(key)).map(event => costsByEvent.get(event.id) ?? 0));
      const purchaseTotal = sumMoney(purchases);
      const saleTotal = sumMoney(sales);
      const costTotal = sumMoney(costs);
      return { key, label: new Intl.DateTimeFormat('es-BO', { month: 'short', timeZone: 'UTC' }).format(date),
        purchases: purchaseTotal, sales: saleTotal, costs: costTotal, profit: sumMoney([saleTotal, -costTotal]) };
    });
  });
  saleCost(saleId: string) { return sumMoney(this.fifo().allocations.filter(item => item.saleId === saleId).map(item => item.cost)); }
  productSold(productId: string) { return this.sales().reduce((sum, sale) => roundWeight(sum + fulfilledQuantity(sale, productId)), 0); }
  productRevenue(productId: string) { return sumMoney(this.sales().map(sale => {
    const line = sale.items.find(item => item.productId === productId);
    return line ? lineValue(fulfilledQuantity(sale, productId), line.unitPrice) : 0;
  })); }

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
      this.orders.update(items => items.map(order => {
        if (order.supplier !== previous.name) return order;
        const renamed = { ...order, supplier: updated.name };
        const change = operationChange(order, renamed, 'Proveedor actualizado', modifiedAt);
        return { ...renamed, modifiedAt, changeHistory: change ? [...(order.changeHistory ?? []), change] : order.changeHistory };
      }));
    }
    return true;
  }
  removeSupplier(id: string) {
    const supplier = this.suppliers().find(item => item.id === id);
    if (!supplier) return 'No encontramos el proveedor que deseas eliminar.';
    if (this.orders().some(order => order.supplier === supplier.name)
      || this.products().some(product => product.supplier === supplier.name && (product.quantity > 0 || product.sold > 0))) {
      return 'No se puede eliminar este proveedor porque aparece en compras o stock registrado.';
    }
    this.suppliers.update(items => items.filter(item => item.id !== id));
    return '';
  }
  addOrder(item: Order) {
    if (item.status === 'Anulada') return 'Una compra nueva debe crearse como pendiente o confirmada.';
    const prepared = this.prepareOrder(item);
    if (prepared.order.status === 'Confirmado') prepared.order.confirmedAt ??= movementAt(operationEffectiveDate(prepared.order));
    const dateError = this.effectiveDateError(prepared.order);
    if (dateError) return dateError;
    if (prepared.added.length) this.products.update(items => [...items, ...prepared.added]);
    if (prepared.order.status === 'Confirmado') this.applyPurchase(prepared.order.items);
    this.orders.update(items => [prepared.order, ...items]);
    return '';
  }
  addSale(item: Sale, usePending = false): SaleResult {
    if (item.status === 'Anulada') return { kind: 'error', message: 'Una venta nueva debe crearse como pendiente o confirmada.' };
    const assessment = this.assessSale(item.items);
    if (assessment.kind === 'error') return assessment;
    if (assessment.kind === 'insufficient') return assessment;
    if (assessment.kind === 'needs-pending' && !usePending) return assessment;
    const status = assessment.kind === 'needs-pending' ? 'Pendiente' : item.status;
    const saved = { ...item, status, effectiveDate: status === 'Confirmado' ? item.effectiveDate ?? item.date : undefined,
      confirmedAt: status === 'Confirmado' ? (item.confirmedAt ?? movementAt(item.effectiveDate ?? item.date)) : undefined };
    const dateError = this.effectiveDateError(saved);
    if (dateError) return { kind: 'error', message: dateError };
    if (status === 'Confirmado') {
      const shortage = calculateFifo(this.initialLots, this.orders(), [...this.sales(), saved]).shortages[0];
      if (shortage) return { kind: 'error', message: this.fifoShortageMessage(shortage.productId, shortage.quantity) };
    }
    if (status === 'Confirmado') this.applySale(saved.items);
    this.sales.update(items => [saved, ...items]);
    return { kind: 'saved', status };
  }
  updateOrder(item: Order, reason: OperationChange['reason'] = 'Edición', note = '') {
    const previous = this.orders().find(order => order.id === item.id);
    if (!previous) return 'No encontramos la compra que deseas editar.';
    if (reason === 'Edición' && !note.trim()) return 'Escribe el motivo de la edición.';
    if (previous.status === 'Anulada') return 'Una compra anulada no se puede editar.';
    if (item.status === 'Anulada') return 'Usa la acción Anular para cancelar una compra pendiente.';
    if (fulfilledWeight(previous) > 0 && previous.status === 'Confirmado' && item.status !== 'Confirmado')
      return 'Una compra con cabello recibido no puede volver a pendiente.';
    if (previous.status === 'Pendiente' && previous.fulfillments?.length && item.status === 'Confirmado')
      return 'Completa las cantidades pendientes desde el detalle de la compra.';
    if (previous.status === 'Confirmado' && fulfilledWeight(previous) > 0
      && (item.effectiveDate ?? item.date) !== operationEffectiveDate(previous))
      return 'La fecha de un movimiento realizado se corrige desde su propio historial.';
    const dateError = this.effectiveDateError(item);
    if (dateError) return dateError;
    const prepared = this.prepareOrder(item);
    const updated = { ...prepared.order, fulfillments: previous.fulfillments, payments: previous.payments,
      confirmedAt: previous.fulfillments?.length || item.status !== 'Confirmado' ? undefined
        : (item.confirmedAt ?? previous.confirmedAt ?? (previous.status === 'Confirmado'
          ? undefined : movementAt(item.effectiveDate ?? item.date))),
      effectiveDate: item.status === 'Confirmado' ? item.effectiveDate ?? item.date : undefined };
    for (const line of previous.items) {
      const done = fulfilledQuantity(previous, line.productId);
      if (done > this.lineWeight(updated.items, line.productId))
        return `No puedes reducir ${productName(line.category, line.length)} por debajo de ${weight(done)} ya recibidos.`;
    }
    if (fulfilledWeight(previous) > 0 && previous.status === 'Confirmado'
      && updated.items.some(line => line.quantity !== fulfilledQuantity(previous, line.productId)))
      return 'No puedes cambiar el peso de una compra totalmente recibida.';
    if (previous.fulfillments?.some(event => eventDate(event) < updated.date))
      return 'La fecha de compra no puede ser posterior a una recepción ya registrada.';
    if (previous.payments?.some(payment => payment.date < updated.date))
      return 'La fecha de compra no puede ser posterior a un pago ya registrado.';
    if (operationValue(updated.items) < operationPaid(previous))
      return `El total de la compra no puede ser menor que ${money(operationPaid(previous))} ya pagados.`;
    const modifiedAt = new Date().toISOString();
    const change = operationChange(previous, updated, reason, modifiedAt, note.trim() || undefined);
    if (!change) return '';
    for (const product of [...this.products(), ...prepared.added]) {
      const oldQuantity = fulfilledQuantity(previous, product.id);
      const newQuantity = fulfilledQuantity(updated, product.id);
      const physical = product.quantity + newQuantity - oldQuantity;
      const oldPending = previous.status === 'Pendiente' ? remainingQuantity(previous, product.id) : 0;
      const newPending = updated.status === 'Pendiente' ? remainingQuantity(updated, product.id) : 0;
      const incoming = this.pendingPurchaseWeight(product.id) + newPending - oldPending;
      if (physical < 0) return `No puedes reducir esta compra: faltaría stock físico de ${product.name}.`;
      if (physical + incoming < this.pendingSaleWeight(product.id)) return `Este cambio dejaría sin respaldo reservas de ${product.name}.`;
    }
    const candidateOrders = this.orders().map(order => order.id === item.id ? updated : order);
    const shortage = calculateFifo(this.initialLots, candidateOrders, this.sales()).shortages[0];
    if (shortage) return this.fifoShortageMessage(shortage.productId, shortage.quantity);
    this.products.update(products => [...products, ...prepared.added].map(product => {
      const oldQuantity = fulfilledQuantity(previous, product.id);
      const newQuantity = fulfilledQuantity(updated, product.id);
      return { ...product, quantity: product.quantity + newQuantity - oldQuantity };
    }));
    this.orders.update(orders => orders.map(order => order.id === item.id
      ? { ...updated, modifiedAt, changeHistory: [...(previous.changeHistory ?? []), change] } : order));
    return '';
  }
  confirmOrder(id: string, effectiveDate = todayLocal()) {
    const order = this.orders().find(item => item.id === id);
    if (!order || order.status !== 'Pendiente') return 'La compra ya no está pendiente.';
    return this.receiveOrder(id, order.items.map(item => ({ productId: item.productId,
      quantity: remainingQuantity(order, item.productId) })).filter(item => item.quantity > 0), effectiveDate);
  }
  receiveOrder(id: string, items: Fulfillment['items'], effectiveDate = todayLocal(), effectiveTime = businessTime()) {
    const order = this.orders().find(item => item.id === id);
    if (!order || order.status !== 'Pendiente') return 'La compra ya no está pendiente.';
    const dateError = this.movementDateError(order.date, effectiveDate, effectiveTime);
    if (dateError) return dateError;
    if (!items.length) return 'Ingresa al menos una cantidad recibida.';
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.productId) || !order.items.some(line => line.productId === item.productId)
        || !hasTwoDecimalPlaces(item.quantity) || item.quantity <= 0
        || item.quantity > remainingQuantity(order, item.productId))
        return 'Las cantidades recibidas deben ser mayores a cero y no superar lo pendiente de cada cabello.';
      seen.add(item.productId);
    }
    const event: Fulfillment = { id: `${id}-REC-${String((order.fulfillments?.length ?? 0) + 1).padStart(4, '0')}`,
      at: movementAt(effectiveDate, effectiveTime), recordedAt: new Date().toISOString(), items: items.map(item => ({ ...item })) };
    const complete = order.items.every(line => remainingQuantity(order, line.productId)
      <= (items.find(item => item.productId === line.productId)?.quantity ?? 0));
    const nextEvents = [...(order.fulfillments ?? []), event].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const updated: Order = { ...order, status: complete ? 'Confirmado' : 'Pendiente',
      effectiveDate: complete ? eventDate(nextEvents.at(-1)!) : undefined,
      fulfillments: nextEvents };
    const shortage = calculateFifo(this.initialLots, this.orders().map(entry => entry.id === id ? updated : entry), this.sales()).shortages[0];
    if (shortage) return this.fifoShortageMessage(shortage.productId, shortage.quantity);
    this.applyPurchase(eventLines(updated, event));
    const recordedAt = event.recordedAt!;
    const change = operationChange(order, updated, 'Confirmación', recordedAt);
    this.orders.update(entries => entries.map(entry => entry.id === id ? { ...updated, modifiedAt: recordedAt,
      changeHistory: change ? [...(order.changeHistory ?? []), change] : order.changeHistory } : entry));
    return '';
  }
  cancelOrder(id: string) {
    const order = this.orders().find(item => item.id === id);
    if (!order || order.status !== 'Pendiente') return 'Solo se pueden anular compras pendientes.';
    const affected: string[] = [];
    for (const item of order.items) {
      const product = this.products().find(product => product.id === item.productId);
      const remaining = (product?.quantity ?? 0) + this.pendingPurchaseWeight(item.productId)
        - remainingQuantity(order, item.productId) - this.pendingSaleWeight(item.productId);
      if (remaining < -0.000001) {
        let backing = (product?.quantity ?? 0) + this.pendingPurchaseWeight(item.productId) - remainingQuantity(order, item.productId);
        const sales = this.sales().filter(sale => sale.status === 'Pendiente' && sale.items.some(line => line.productId === item.productId))
          .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
        const uncovered: string[] = [];
        for (const sale of sales) {
          const quantity = remainingQuantity(sale, item.productId);
          if (quantity > backing + 0.000001) uncovered.push(`${sale.id} · ${sale.customer} (${weight(quantity - Math.max(0, backing))})`);
          backing -= quantity;
        }
        affected.push(`${productName(item.category, item.length)}: faltan ${weight(-remaining)}; reservas sin respaldo: ${uncovered.join(', ')}`);
      }
    }
    if (affected.length) return `No se puede anular esta compra porque dejaría reservas sin respaldo. ${affected.join('. ')}`;
    if (operationPaid(order) > fulfilledValue(order))
      return 'No se puede anular el saldo pendiente mientras los pagos superen el valor recibido.';
    const cancelledAt = new Date().toISOString();
    const cancelled = { ...order, status: 'Anulada' as const };
    const change = operationChange(order, cancelled, 'Anulación', cancelledAt);
    this.orders.update(orders => orders.map(entry => entry.id === id
      ? { ...cancelled, cancelledAt, changeHistory: change ? [...(order.changeHistory ?? []), change] : order.changeHistory } : entry));
    return '';
  }
  updateSale(item: Sale, usePending = false, reason: OperationChange['reason'] = 'Edición', note = ''): SaleResult | { kind: 'error'; message: string } {
    const previous = this.sales().find(sale => sale.id === item.id);
    if (!previous) return { kind: 'error', message: 'No encontramos la venta que deseas editar.' };
    if (reason === 'Edición' && !note.trim()) return { kind: 'error', message: 'Escribe el motivo de la edición.' };
    if (previous.status === 'Anulada') return { kind: 'error', message: 'Una venta anulada no se puede editar.' };
    if (item.status === 'Anulada') return { kind: 'error', message: 'Usa la acción Anular para cancelar una venta pendiente.' };
    if (previous.status === 'Confirmado' && item.status !== 'Confirmado')
      return { kind: 'error', message: 'Una venta con cabello entregado no puede volver a pendiente.' };
    if (previous.status === 'Pendiente' && previous.fulfillments?.length && item.status === 'Confirmado')
      return { kind: 'error', message: 'Completa las cantidades pendientes desde el detalle de la venta.' };
    if (previous.status === 'Confirmado' && fulfilledWeight(previous) > 0
      && (item.effectiveDate ?? item.date) !== operationEffectiveDate(previous))
      return { kind: 'error', message: 'La fecha de un movimiento realizado se corrige desde su propio historial.' };
    for (const line of previous.items) if (fulfilledQuantity(previous, line.productId)
      > this.lineWeight(item.items, line.productId))
      return { kind: 'error', message: `No puedes reducir ${productName(line.category, line.length)} por debajo de la cantidad ya entregada.` };
    if (fulfilledWeight(previous) > 0 && previous.status === 'Confirmado'
      && item.items.some(line => line.quantity !== fulfilledQuantity(previous, line.productId)))
      return { kind: 'error', message: 'No puedes cambiar el peso de una venta totalmente entregada.' };
    if (previous.fulfillments?.some(event => eventDate(event) < item.date))
      return { kind: 'error', message: 'La fecha de venta no puede ser posterior a una entrega ya registrada.' };
    if (previous.payments?.some(payment => payment.date < item.date))
      return { kind: 'error', message: 'La fecha de venta no puede ser posterior a un cobro ya registrado.' };
    if (operationValue(item.items) < operationPaid(previous))
      return { kind: 'error', message: `El total de la venta no puede ser menor que ${money(operationPaid(previous))} ya cobrados.` };
    const assessment = this.assessSale(item.items, previous);
    if (assessment.kind === 'error') return assessment;
    if (assessment.kind === 'insufficient') return assessment;
    if (assessment.kind === 'needs-pending' && !usePending) return assessment;
    const status = assessment.kind === 'needs-pending' ? 'Pendiente' : item.status;
    const updated = { ...item, status, fulfillments: previous.fulfillments, payments: previous.payments,
      confirmedAt: previous.fulfillments?.length || status !== 'Confirmado' ? undefined
        : (item.confirmedAt ?? previous.confirmedAt ?? (previous.status === 'Confirmado'
          ? undefined : movementAt(item.effectiveDate ?? item.date))),
      effectiveDate: status === 'Confirmado' ? item.effectiveDate ?? item.date : undefined };
    const dateError = this.effectiveDateError(updated);
    if (dateError) return { kind: 'error', message: dateError };
    const modifiedAt = new Date().toISOString();
    const change = operationChange(previous, updated, reason, modifiedAt, note.trim() || undefined);
    if (!change) return { kind: 'saved', status };
    const candidateSales = this.sales().map(sale => sale.id === item.id ? updated : sale);
    const shortage = calculateFifo(this.initialLots, this.orders(), candidateSales).shortages[0];
    if (shortage) return { kind: 'error', message: this.fifoShortageMessage(shortage.productId, shortage.quantity) };
    this.products.update(products => products.map(product => {
      const oldQuantity = fulfilledQuantity(previous, product.id);
      const newQuantity = fulfilledQuantity(updated, product.id);
      return { ...product, quantity: product.quantity + oldQuantity - newQuantity, sold: product.sold - oldQuantity + newQuantity };
    }));
    this.sales.update(sales => sales.map(sale => sale.id === item.id
      ? { ...updated, modifiedAt, changeHistory: [...(previous.changeHistory ?? []), change] } : sale));
    return { kind: 'saved', status };
  }
  pendingPurchaseWeight(productId: string) {
    return roundWeight(this.orders().filter(order => order.status === 'Pendiente')
      .reduce((sum, order) => sum + remainingQuantity(order, productId), 0));
  }
  pendingSaleWeight(productId: string) {
    return roundWeight(this.sales().filter(sale => sale.status === 'Pendiente')
      .reduce((sum, sale) => sum + remainingQuantity(sale, productId), 0));
  }
  sellableWeight(productId: string) {
    const product = this.products().find(item => item.id === productId);
    if (!product) return 0;
    return Math.max(0, product.quantity - this.pendingSaleWeight(productId));
  }
  reservableWeight(productId: string) {
    const product = this.products().find(item => item.id === productId);
    return product ? Math.max(0, product.quantity + this.pendingPurchaseWeight(productId) - this.pendingSaleWeight(productId)) : 0;
  }
  availabilityStatus(product: Product) {
    return stockStatus({ ...product, quantity: this.sellableWeight(product.id) });
  }
  confirmSale(id: string, effectiveDate = todayLocal()) {
    const sale = this.sales().find(item => item.id === id);
    if (!sale || sale.status !== 'Pendiente') return 'La venta ya no está pendiente.';
    return this.deliverSale(id, sale.items.map(item => ({ productId: item.productId,
      quantity: remainingQuantity(sale, item.productId) })).filter(item => item.quantity > 0), effectiveDate);
  }
  deliverSale(id: string, items: Fulfillment['items'], effectiveDate = todayLocal(), effectiveTime = businessTime()) {
    const sale = this.sales().find(item => item.id === id);
    if (!sale || sale.status !== 'Pendiente') return 'La venta ya no está pendiente.';
    const dateError = this.movementDateError(sale.date, effectiveDate, effectiveTime);
    if (dateError) return dateError;
    if (!items.length) return 'Ingresa al menos una cantidad entregada.';
    const seen = new Set<string>();
    for (const item of items) {
      const line = sale.items.find(entry => entry.productId === item.productId);
      if (seen.has(item.productId) || !line || !hasTwoDecimalPlaces(item.quantity) || item.quantity <= 0
        || item.quantity > remainingQuantity(sale, item.productId))
        return 'Las cantidades entregadas deben ser mayores a cero y no superar lo pendiente de cada cabello.';
      seen.add(item.productId);
      const product = this.products().find(entry => entry.id === item.productId);
      const earlier = this.sales().filter(entry => entry.status === 'Pendiente' && entry.id !== id
        && (entry.date < sale.date || entry.date === sale.date && entry.id < sale.id))
        .reduce((sum, entry) => sum + remainingQuantity(entry, item.productId), 0);
      if (!product || item.quantity > Math.max(0, product.quantity - earlier))
        return `Aún no hay stock físico suficiente de ${productName(line.category, line.length)} para entregar ${weight(item.quantity)}; hay ${weight(Math.max(0, (product?.quantity ?? 0) - earlier))} disponibles para esta reserva.`;
    }
    const event: Fulfillment = { id: `${id}-ENT-${String((sale.fulfillments?.length ?? 0) + 1).padStart(4, '0')}`,
      at: movementAt(effectiveDate, effectiveTime), recordedAt: new Date().toISOString(), items: items.map(item => ({ ...item })) };
    const complete = sale.items.every(line => remainingQuantity(sale, line.productId)
      <= (items.find(item => item.productId === line.productId)?.quantity ?? 0));
    const nextEvents = [...(sale.fulfillments ?? []), event].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const updated: Sale = { ...sale, status: complete ? 'Confirmado' : 'Pendiente',
      effectiveDate: complete ? eventDate(nextEvents.at(-1)!) : undefined,
      fulfillments: nextEvents };
    const shortage = calculateFifo(this.initialLots, this.orders(), this.sales().map(entry => entry.id === id ? updated : entry)).shortages[0];
    if (shortage) return this.fifoShortageMessage(shortage.productId, shortage.quantity);
    this.applySale(eventLines(updated, event));
    const recordedAt = event.recordedAt!;
    const change = operationChange(sale, updated, 'Confirmación', recordedAt);
    this.sales.update(entries => entries.map(entry => entry.id === id ? { ...updated, modifiedAt: recordedAt,
      changeHistory: change ? [...(sale.changeHistory ?? []), change] : sale.changeHistory } : entry));
    return '';
  }
  correctFulfillment(kind: 'purchase' | 'sale', id: string, eventId: string,
    date: string, time: string, items: Fulfillment['items'], reason: string) {
    if (this.role() !== 'admin') return 'Solo el administrador puede corregir movimientos.';
    if (!reason.trim()) return 'Escribe el motivo de la corrección.';
    const operation = kind === 'purchase' ? this.orders().find(item => item.id === id)
      : this.sales().find(item => item.id === id);
    const original = operation && operationEvents(operation).find(event => event.id === eventId);
    if (!operation || !original) return 'No encontramos el movimiento.';
    if (original.voidedAt) return 'Este movimiento ya fue anulado.';
    const dateError = items.length ? this.movementDateError(operation.date, date, time) : '';
    if (dateError) return dateError;
    const seen = new Set<string>();
    for (const item of items) {
      const line = operation.items.find(entry => entry.productId === item.productId);
      const old = original.items.find(entry => entry.productId === item.productId)?.quantity ?? 0;
      if (!line || seen.has(item.productId) || !hasTwoDecimalPlaces(item.quantity) || item.quantity <= 0
        || item.quantity > roundWeight(line.quantity - fulfilledQuantity(operation, item.productId) + old))
        return 'La corrección debe respetar el peso acordado y lo ya realizado en otros movimientos.';
      seen.add(item.productId);
    }
    const before: FulfillmentSnapshot = { at: original.at, items: original.items.map(item => ({ ...item })) };
    const after: FulfillmentSnapshot = { at: items.length ? movementAt(date, time) : original.at,
      items: items.map(item => ({ ...item })) };
    if (JSON.stringify(before) === JSON.stringify(after)) return '';
    const changedAt = new Date().toISOString();
    const corrected: Fulfillment = { ...original, ...after, voidedAt: items.length ? undefined : changedAt,
      changes: [...(original.changes ?? []),
      { at: changedAt, reason: reason.trim(), before, after }] };
    const fulfillments = operationEvents(operation).map(event => event.id === eventId ? corrected : event)
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const completed = operation.items.every(line => roundWeight(fulfillments.flatMap(event => event.items)
      .filter(item => item.productId === line.productId).reduce((sum, item) => sum + item.quantity, 0)) === line.quantity);
    const status: OperationStatus = operation.status === 'Anulada' ? 'Anulada' : completed ? 'Confirmado' : 'Pendiente';
    const candidate = { ...operation, fulfillments, status, confirmedAt: undefined,
      effectiveDate: status === 'Confirmado' ? eventDate(fulfillments.at(-1)!) : undefined };
    if (operationPaid(operation) > operationPayableTotal(candidate))
      return 'La corrección dejaría el valor realizado por debajo de lo ya pagado.';
    for (const product of this.products()) {
      const old = original.items.find(item => item.productId === product.id)?.quantity ?? 0;
      const next = after.items.find(item => item.productId === product.id)?.quantity ?? 0;
      const physical = roundWeight(product.quantity + (kind === 'purchase' ? next - old : old - next));
      if (physical < 0) return `La corrección dejaría stock físico negativo de ${product.name}.`;
      if (kind === 'purchase') {
        const incoming = this.pendingPurchaseWeight(product.id)
          - (operation.status === 'Pendiente' ? remainingQuantity(operation, product.id) : 0)
          + (status === 'Pendiente' ? remainingQuantity(candidate, product.id) : 0);
        if (roundWeight(physical + incoming) < this.pendingSaleWeight(product.id))
          return `La corrección dejaría reservas sin respaldo de ${product.name}.`;
      } else {
        const reserved = this.pendingSaleWeight(product.id)
          - (operation.status === 'Pendiente' ? remainingQuantity(operation, product.id) : 0)
          + (status === 'Pendiente' ? remainingQuantity(candidate, product.id) : 0);
        if (roundWeight(physical + this.pendingPurchaseWeight(product.id)) < reserved)
          return `La corrección dejaría reservas sin respaldo de ${product.name}.`;
      }
    }
    const fifo = kind === 'purchase'
      ? calculateFifo(this.initialLots, this.orders().map(item => item.id === id ? candidate as Order : item), this.sales())
      : calculateFifo(this.initialLots, this.orders(), this.sales().map(item => item.id === id ? candidate as Sale : item));
    const shortage = fifo.shortages[0];
    if (shortage) return this.fifoShortageMessage(shortage.productId, shortage.quantity);
    this.products.update(products => products.map(product => {
      const old = original.items.find(item => item.productId === product.id)?.quantity ?? 0;
      const next = after.items.find(item => item.productId === product.id)?.quantity ?? 0;
      const delta = next - old;
      return kind === 'purchase' ? { ...product, quantity: roundWeight(product.quantity + delta) }
        : { ...product, quantity: roundWeight(product.quantity - delta), sold: roundWeight(product.sold + delta) };
    }));
    const change = operationChange(operation, candidate, 'Edición', changedAt, reason.trim());
    if (kind === 'purchase') this.orders.update(entries => entries.map(entry => entry.id === id
      ? { ...candidate as Order, modifiedAt: changedAt,
        changeHistory: change ? [...(operation.changeHistory ?? []), change] : operation.changeHistory } : entry));
    else this.sales.update(entries => entries.map(entry => entry.id === id
      ? { ...candidate as Sale, modifiedAt: changedAt,
        changeHistory: change ? [...(operation.changeHistory ?? []), change] : operation.changeHistory } : entry));
    return '';
  }
  cancelSale(id: string) {
    const sale = this.sales().find(item => item.id === id);
    if (!sale || sale.status !== 'Pendiente') return 'Solo se pueden anular ventas pendientes.';
    if (operationPaid(sale) > fulfilledValue(sale))
      return 'No se puede anular el saldo pendiente mientras los cobros superen el valor entregado.';
    const cancelledAt = new Date().toISOString();
    const cancelled = { ...sale, status: 'Anulada' as const };
    const change = operationChange(sale, cancelled, 'Anulación', cancelledAt);
    this.sales.update(sales => sales.map(entry => entry.id === id
      ? { ...cancelled, cancelledAt, changeHistory: change ? [...(sale.changeHistory ?? []), change] : sale.changeHistory } : entry));
    return '';
  }
  private effectiveDateError(item: Order | Sale) {
    if (item.status !== 'Confirmado') return '';
    const effectiveDate = operationEffectiveDate(item);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return 'Ingresa una fecha efectiva válida para confirmar la operación.';
    if (item.date > todayLocal()) return 'Una operación con fecha futura debe quedar pendiente hasta que se realice.';
    if (effectiveDate > todayLocal()) return 'No se puede confirmar una compra o venta con fecha efectiva futura.';
    if (effectiveDate < item.date) return 'La fecha efectiva no puede ser anterior a la fecha de compra o reserva.';
    if (item.confirmedAt) {
      if (item.confirmedAt.slice(0, 10) !== effectiveDate) return 'La fecha y hora efectivas deben corresponder al mismo día.';
      const timeError = this.movementDateError(item.date, effectiveDate, item.confirmedAt.slice(11, 16));
      if (timeError) return timeError;
    }
    return '';
  }
  private movementDateError(operationDate: string, date: string, time: string) {
    const parsed = new Date(`${date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== date || date < operationDate || date > todayLocal())
      return 'La fecha del movimiento debe estar entre la fecha de la operación y hoy.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'Ingresa una hora válida para el movimiento.';
    if (date === todayLocal() && time > businessTime()) return 'La hora del movimiento no puede estar en el futuro.';
    return '';
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
      const reserved = this.pendingSaleWeight(product.id) - (previous?.status === 'Pendiente' ? remainingQuantity(previous, product.id) : 0);
      const priorDone = previous ? fulfilledQuantity(previous, product.id) : 0;
      const physical = product.quantity;
      const requested = roundWeight(item.quantity - priorDone);
      const available = Math.max(0, physical - reserved);
      const backed = Math.max(0, physical + pending - reserved);
      if (requested > backed) shortages.push({ product, requested, physical: available, pending: Math.max(0, backed - available), missing: requested - backed });
      else if (requested > available && !pendingRequired) pendingRequired = { kind: 'needs-pending', product, available, pending };
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
      return quantity ? { ...product, quantity: roundWeight(product.quantity + quantity) } : product;
    }));
  }
  private applySale(items: HairLine[]) {
    this.products.update(products => products.map(product => {
      const quantity = items.filter(item => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
      return quantity ? { ...product, quantity: roundWeight(product.quantity - quantity), sold: roundWeight(product.sold + quantity) } : product;
    }));
  }
  private paymentError(operation: Order | Sale, date: string, amount: number, maximum: number) {
    const parsed = new Date(`${date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime())
      || parsed.toISOString().slice(0, 10) !== date || date < operation.date || date > todayLocal())
      return 'La fecha del pago debe estar entre la fecha de la operación y hoy.';
    if (!hasTwoDecimalPlaces(amount) || amount <= 0) return 'El importe debe ser mayor a cero y tener como máximo dos decimales.';
    if (amountCents(amount, 1) > amountCents(maximum, 1)) return `El pago no puede superar ${money(maximum)}.`;
    return '';
  }
  addOperationPayment(kind: 'purchase' | 'sale', id: string, input: OperationPaymentSnapshot) {
    if (this.role() !== 'admin') return 'Solo el administrador puede registrar pagos.';
    if (!['Efectivo', 'QR', 'Transferencia', 'Otro'].includes(input.method)) return 'Selecciona un método de pago válido.';
    const operation = kind === 'purchase' ? this.orders().find(item => item.id === id)
      : this.sales().find(item => item.id === id);
    if (!operation) return 'No encontramos la operación.';
    const error = this.paymentError(operation, input.date, input.amount, operationBalance(operation));
    if (error) return error;
    const next = (operation.payments?.length ?? 0) + 1;
    const payment: OperationPayment = { ...input, amount: amountCents(input.amount, 1) / 100,
      reference: input.reference.trim(), id: `${id}-PAG-${String(next).padStart(4, '0')}` };
    const modifiedAt = new Date().toISOString();
    if (kind === 'purchase') this.orders.update(items => items.map(item => item.id === id
      ? { ...item, modifiedAt, payments: [...(item.payments ?? []), payment] } : item));
    else this.sales.update(items => items.map(item => item.id === id
      ? { ...item, modifiedAt, payments: [...(item.payments ?? []), payment] } : item));
    return '';
  }
  updateOperationPayment(kind: 'purchase' | 'sale', id: string, paymentId: string,
    input: OperationPaymentSnapshot, reason: string) {
    if (this.role() !== 'admin') return 'Solo el administrador puede corregir pagos.';
    if (!reason.trim()) return 'Escribe el motivo de la corrección del pago.';
    if (!['Efectivo', 'QR', 'Transferencia', 'Otro'].includes(input.method)) return 'Selecciona un método de pago válido.';
    const operation = kind === 'purchase' ? this.orders().find(item => item.id === id)
      : this.sales().find(item => item.id === id);
    const payment = operation?.payments?.find(item => item.id === paymentId);
    if (!operation || !payment) return 'No encontramos el pago.';
    if (payment.voidedAt) return 'Un pago anulado no se puede corregir.';
    const maximum = sumMoney([operationBalance(operation), payment.amount]);
    const error = this.paymentError(operation, input.date, input.amount, maximum);
    if (error) return error;
    const before: OperationPaymentState = { date: payment.date, amount: payment.amount,
      method: payment.method, reference: payment.reference, voided: false };
    const after: OperationPaymentState = { ...input, amount: amountCents(input.amount, 1) / 100,
      reference: input.reference.trim(), voided: false };
    if (JSON.stringify(before) === JSON.stringify(after)) return '';
    const at = new Date().toISOString();
    const updated: OperationPayment = { ...payment, date: after.date, amount: after.amount,
      method: after.method, reference: after.reference, changes: [...(payment.changes ?? []),
      { at, reason: reason.trim(), before, after }] };
    if (kind === 'purchase') this.orders.update(items => items.map(item => item.id === id
      ? { ...item, modifiedAt: at, payments: item.payments?.map(entry => entry.id === paymentId ? updated : entry) } : item));
    else this.sales.update(items => items.map(item => item.id === id
      ? { ...item, modifiedAt: at, payments: item.payments?.map(entry => entry.id === paymentId ? updated : entry) } : item));
    return '';
  }
  voidOperationPayment(kind: 'purchase' | 'sale', id: string, paymentId: string, reason: string) {
    if (this.role() !== 'admin') return 'Solo el administrador puede anular pagos.';
    if (!reason.trim()) return 'Escribe el motivo de la anulación del pago.';
    const operation = kind === 'purchase' ? this.orders().find(item => item.id === id)
      : this.sales().find(item => item.id === id);
    const payment = operation?.payments?.find(item => item.id === paymentId);
    if (!operation || !payment) return 'No encontramos el pago.';
    if (payment.voidedAt) return 'Este pago ya fue anulado.';
    const at = new Date().toISOString();
    const before: OperationPaymentState = { date: payment.date, amount: payment.amount,
      method: payment.method, reference: payment.reference, voided: false };
    const updated: OperationPayment = { ...payment, voidedAt: at, changes: [...(payment.changes ?? []),
      { at, reason: reason.trim(), before, after: { ...before, voided: true } }] };
    if (kind === 'purchase') this.orders.update(items => items.map(item => item.id === id
      ? { ...item, modifiedAt: at, payments: item.payments?.map(entry => entry.id === paymentId ? updated : entry) } : item));
    else this.sales.update(items => items.map(item => item.id === id
      ? { ...item, modifiedAt: at, payments: item.payments?.map(entry => entry.id === paymentId ? updated : entry) } : item));
    return '';
  }
  addDebt(item: Debt) { this.debts.update(items => [item, ...items]); }
  updateDebt(item: Debt) {
    const previous = this.debts().find(debt => debt.id === item.id);
    if (!previous) return;
    const before = debtSnapshot(previous);
    const after = debtSnapshot(item);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const change: DebtChange = { at: new Date().toISOString(), before, after };
    this.debts.update(items => items.map(debt => debt.id === item.id
      ? { ...item, payments: debt.payments, changeHistory: [...(debt.changeHistory ?? []), change] }
      : debt));
  }
  private debtPaymentError(debt: Debt, date: string, amount: number, maximum: number) {
    const parsedDate = new Date(`${date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== date || date < debt.date || date > todayLocal()) {
      return 'La fecha del pago debe ser válida y estar entre la fecha de registro y hoy.';
    }
    if (!hasTwoDecimalPlaces(amount) || amount <= 0) {
      return 'Ingresa un importe mayor a cero con un máximo de dos decimales.';
    }
    if (amountCents(amount, 1) > amountCents(maximum, 1)) return `El abono no puede superar ${money(maximum)}.`;
    return '';
  }
  addDebtPayment(debtId: string, date: string, amount: number, note: string) {
    const debt = this.debts().find(item => item.id === debtId);
    if (!debt) return 'No encontramos la deuda.';
    const error = this.debtPaymentError(debt, date, amount, debtBalance(debt));
    if (error) return error;
    const normalizedAmount = amountCents(amount, 1) / 100;
    const next = Math.max(0, ...debt.payments.map(payment => Number(payment.id.split('-').at(-1)) || 0)) + 1;
    const payment: DebtPayment = { id: `PAG-${debtId}-${next}`, date, amount: normalizedAmount, note: note.trim() };
    this.debts.update(items => items.map(item => item.id === debtId ? { ...item, payments: [...item.payments, payment] } : item));
    return '';
  }
  updateDebtPayment(debtId: string, paymentId: string, date: string, amount: number, note: string) {
    const debt = this.debts().find(item => item.id === debtId);
    const payment = debt?.payments.find(item => item.id === paymentId);
    if (!debt || !payment) return 'No encontramos el abono que deseas corregir.';
    if (payment.voidedAt) return 'Un abono anulado no se puede editar.';
    const maximum = sumMoney([debtBalance(debt), payment.amount]);
    const error = this.debtPaymentError(debt, date, amount, maximum);
    if (error) return error;
    const updated = { ...payment, date, amount: amountCents(amount, 1) / 100, note: note.trim() };
    const before = paymentSnapshot(payment);
    const after = paymentSnapshot(updated);
    if (JSON.stringify(before) === JSON.stringify(after)) return '';
    const change: DebtPaymentChange = { at: new Date().toISOString(), reason: 'Corrección', before, after };
    this.debts.update(items => items.map(item => item.id === debtId ? {
      ...item, payments: item.payments.map(entry => entry.id === paymentId
        ? { ...updated, changes: [...(payment.changes ?? []), change] } : entry),
    } : item));
    return '';
  }
  voidDebtPayment(debtId: string, paymentId: string) {
    const debt = this.debts().find(item => item.id === debtId);
    const payment = debt?.payments.find(item => item.id === paymentId);
    if (!debt || !payment) return 'No encontramos el abono que deseas anular.';
    if (payment.voidedAt) return 'Este abono ya está anulado.';
    const voidedAt = new Date().toISOString();
    const updated = { ...payment, voidedAt };
    const change: DebtPaymentChange = { at: voidedAt, reason: 'Anulación',
      before: paymentSnapshot(payment), after: paymentSnapshot(updated) };
    this.debts.update(items => items.map(item => item.id === debtId ? {
      ...item, payments: item.payments.map(entry => entry.id === paymentId
        ? { ...updated, changes: [...(payment.changes ?? []), change] } : entry),
    } : item));
    return '';
  }
}

export const money = (value: number) => `Bs. ${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
export const unitPriceLabel = (value: number) => `Bs. ${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
export const weight = (grams: number) => `${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(grams)} g`;
export const categoryLabel = (value: HairCategory) => value.charAt(0).toUpperCase() + value.slice(1);
export const productName = (category: HairCategory, length: HairLength) => `Cabello ${category} ${length} cm`;
export const operationName = (date: string, party: string) => `${dateLabel(date)} · ${party}`;
export const operationWeight = (items: HairLine[]) => items.reduce((sum, item) => roundWeight(sum + item.quantity), 0);
export const roundWeight = (quantity: number) => Math.round(quantity * 100) / 100;
export const operationValue = (items: HairLine[]) => sumMoney(items.map(item => lineValue(item.quantity, item.unitPrice)));
export const operationEffectiveDate = (item: Order | Sale) => item.effectiveDate ?? item.date;
export const operationEvents = (operation: Order | Sale): Fulfillment[] => operation.fulfillments ?? (
  operation.status === 'Confirmado' ? [{ id: `${operation.id}-completo`, at: operation.confirmedAt
    ? `${operationEffectiveDate(operation)}T${operation.confirmedAt.slice(11)}` : `${operationEffectiveDate(operation)}T00:00:00-04:00`,
    items: operation.items.map(item => ({ productId: item.productId, quantity: item.quantity })) }] : []);
export const fulfilledQuantity = (operation: Order | Sale, productId: string) => operationEvents(operation)
  .flatMap(event => event.items).filter(item => item.productId === productId)
  .reduce((sum, item) => roundWeight(sum + item.quantity), 0);
export const remainingQuantity = (operation: Order | Sale, productId: string) =>
  Math.max(0, roundWeight(operation.items.filter(item => item.productId === productId).reduce((sum, item) => sum + item.quantity, 0)
    - fulfilledQuantity(operation, productId)));
export const fulfilledWeight = (operation: Order | Sale) => operationEvents(operation)
  .flatMap(event => event.items).reduce((sum, item) => roundWeight(sum + item.quantity), 0);
export const eventWeight = (event: Fulfillment) => event.items.reduce((sum, item) => roundWeight(sum + item.quantity), 0);
export const fulfillmentSummary = (operation: Order | Sale, items: Fulfillment['items']) => items.map(part => {
  const line = operation.items.find(item => item.productId === part.productId);
  return `${line ? productName(line.category, line.length) : part.productId}: ${weight(part.quantity)}`;
}).join(' · ') || 'Sin cantidades';
export const fulfilledValue = (operation: Order | Sale) => sumMoney(operation.items.map(item =>
  lineValue(fulfilledQuantity(operation, item.productId), item.unitPrice)));
export const pendingValue = (operation: Order | Sale) => operation.status === 'Pendiente'
  ? sumMoney([operationValue(operation.items), -fulfilledValue(operation)]) : 0;
export const operationPayableTotal = (operation: Order | Sale) => operation.status === 'Anulada'
  ? fulfilledValue(operation) : operationValue(operation.items);
export const operationPaid = (operation: Order | Sale) => sumMoney((operation.payments ?? [])
  .filter(payment => !payment.voidedAt).map(payment => payment.amount));
export const operationBalance = (operation: Order | Sale) => Math.max(0,
  sumMoney([operationPayableTotal(operation), -operationPaid(operation)]));
export const eventLines = (operation: Order | Sale, event: Fulfillment): HairLine[] => event.items.flatMap(part => {
  const line = operation.items.find(item => item.productId === part.productId);
  return line ? [{ ...line, quantity: part.quantity }] : [];
});
export const eventLineValue = (operation: Order | Sale, event: Fulfillment, productId: string) => {
  const earlier = operationEvents(operation).slice(0, operationEvents(operation).findIndex(item => item.id === event.id));
  const part = event.items.find(item => item.productId === productId);
  const line = operation.items.find(item => item.productId === productId);
  if (!part || !line) return 0;
  const before = earlier.flatMap(item => item.items).filter(item => item.productId === productId)
    .reduce((sum, item) => sum + item.quantity, 0);
  return sumMoney([lineValue(before + part.quantity, line.unitPrice), -lineValue(before, line.unitPrice)]);
};
export const eventValue = (operation: Order | Sale, event: Fulfillment) => sumMoney(event.items
  .map(part => eventLineValue(operation, event, part.productId)));
export const eventDate = (event: Fulfillment) => event.at.slice(0, 10);
export const businessTime = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', hourCycle: 'h23',
    hour: '2-digit', minute: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '00';
  return `${part('hour')}:${part('minute')}`;
};
export const movementAt = (date: string, time = businessTime()) => `${date}T${time}:00-04:00`;
export const todayLocal = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', year: 'numeric',
    month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
};
export const dateLabel = (value: string) => value ? new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : '—';
export const modifiedLabel = (value: string) => new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/La_Paz' }).format(new Date(value));
export const stockStatus = (product: Product) => product.quantity === 0 ? 'Agotado' : product.quantity <= product.threshold ? 'Stock bajo' : 'Disponible';
export const debtPaid = (debt: Debt) => sumMoney(debt.payments.filter(payment => !payment.voidedAt).map(payment => payment.amount));
export const debtBalance = (debt: Debt) => Math.max(0, sumMoney([debt.total, -debtPaid(debt)]));
export const debtStatus = (debt: Debt): DebtStatus => {
  if (debtBalance(debt) === 0) return 'Pagada';
  if (debt.dueDate && debt.dueDate < todayLocal()) return 'Vencida';
  return debtPaid(debt) > 0 ? 'Parcial' : 'Pendiente';
};
export function csvContent(headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  return `\ufeff${[headers, ...rows].map(row => row.map(escape).join(';')).join('\n')}`;
}
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  downloadBlob(filename, new Blob([csvContent(headers, rows)], { type: 'text/csv;charset=utf-8' }));
}
