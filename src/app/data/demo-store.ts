import { computed, Injectable, signal } from '@angular/core';
import { calculateFifo, openingLots } from './fifo';
import { amountCents, lineValue, sumMoney } from './money';

export { lineValue } from './money';

export type Role = 'admin' | 'employee';
export type EmployeeSnapshot = { fullName: string; username: string; ci: string; birthDate: string; phone: string; active: boolean };
export type EmployeeChange = { at: string; action: 'Creación' | 'Edición' | 'Desactivación' | 'Reactivación' | 'Contraseña restablecida'; before?: EmployeeSnapshot; after: EmployeeSnapshot };
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
export type OperationSnapshot = { party: string; date: string; effectiveDate?: string; status: OperationStatus; items: HairLine[] };
export type OperationChange = { at: string; reason: 'Edición' | 'Confirmación' | 'Anulación' | 'Proveedor actualizado'; before: OperationSnapshot; after: OperationSnapshot };
export type Order = { id: string; supplier: string; date: string; effectiveDate?: string; status: OperationStatus; items: HairLine[]; modifiedAt?: string; cancelledAt?: string; changeHistory?: OperationChange[] };
export type Sale = { id: string; customer: string; date: string; effectiveDate?: string; status: OperationStatus; items: HairLine[]; modifiedAt?: string; cancelledAt?: string; changeHistory?: OperationChange[] };
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
  status: item.status,
  items: item.items.map(line => ({ ...line })),
});

const operationChange = (before: Order | Sale, after: Order | Sale, reason: OperationChange['reason'], at: string): OperationChange | null => {
  const previous = operationSnapshot(before);
  const next = operationSnapshot(after);
  return JSON.stringify(previous) === JSON.stringify(next) ? null : { at, reason, before: previous, after: next };
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
  readonly confirmedSales = computed(() => this.sales().filter(sale => sale.status === 'Confirmado'));
  readonly managedProducts = computed(() => this.products().filter(product => product.quantity > 0
    || this.orders().some(order => order.status === 'Confirmado' && order.items.some(item => item.productId === product.id))));
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
    this.employees.update(items => items.map(item => item.id === id
      ? { ...item, modifiedAt: at, changes: [...item.changes, change] } : item));
    return '';
  }
  readonly monthlySummaries = computed<MonthlySummary[]>(() => {
    const now = new Date();
    const costsBySale = new Map<string, number>();
    for (const allocation of this.fifo().allocations) costsBySale.set(allocation.saleId,
      sumMoney([costsBySale.get(allocation.saleId) ?? 0, allocation.cost]));
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const purchases = this.orders().filter(order => order.status === 'Confirmado' && operationEffectiveDate(order).startsWith(key))
        .map(order => operationValue(order.items));
      const sales = this.confirmedSales().filter(sale => operationEffectiveDate(sale).startsWith(key))
        .map(sale => operationValue(sale.items));
      const costs = this.confirmedSales().filter(sale => operationEffectiveDate(sale).startsWith(key))
        .map(sale => costsBySale.get(sale.id) ?? 0);
      const purchaseTotal = sumMoney(purchases);
      const saleTotal = sumMoney(sales);
      const costTotal = sumMoney(costs);
      return { key, label: new Intl.DateTimeFormat('es-BO', { month: 'short' }).format(date),
        purchases: purchaseTotal, sales: saleTotal, costs: costTotal, profit: sumMoney([saleTotal, -costTotal]) };
    });
  });
  saleCost(saleId: string) { return sumMoney(this.fifo().allocations.filter(item => item.saleId === saleId).map(item => item.cost)); }
  productSold(productId: string) { return this.confirmedSales().flatMap(sale => sale.items).filter(item => item.productId === productId).reduce((sum, item) => sum + item.quantity, 0); }
  productRevenue(productId: string) { return sumMoney(this.confirmedSales().flatMap(sale => sale.items).filter(item => item.productId === productId).map(item => lineValue(item.quantity, item.unitPrice))); }

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
    const dateError = this.effectiveDateError(item);
    if (dateError) return dateError;
    const prepared = this.prepareOrder(item);
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
    const saved = { ...item, status, effectiveDate: status === 'Confirmado' ? item.effectiveDate ?? item.date : undefined };
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
  updateOrder(item: Order, reason: OperationChange['reason'] = 'Edición') {
    const previous = this.orders().find(order => order.id === item.id);
    if (!previous) return 'No encontramos la compra que deseas editar.';
    if (previous.status === 'Anulada') return 'Una compra anulada no se puede editar.';
    if (item.status === 'Anulada') return 'Usa la acción Anular para cancelar una compra pendiente.';
    const dateError = this.effectiveDateError(item);
    if (dateError) return dateError;
    const prepared = this.prepareOrder(item);
    const updated = { ...prepared.order, effectiveDate: item.status === 'Confirmado' ? item.effectiveDate ?? item.date : undefined };
    const modifiedAt = new Date().toISOString();
    const change = operationChange(previous, updated, reason, modifiedAt);
    if (!change) return '';
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
    this.orders.update(orders => orders.map(order => order.id === item.id
      ? { ...updated, modifiedAt, changeHistory: [...(previous.changeHistory ?? []), change] } : order));
    return '';
  }
  confirmOrder(id: string, effectiveDate = todayLocal()) {
    const order = this.orders().find(item => item.id === id);
    if (!order || order.status !== 'Pendiente') return 'La compra ya no está pendiente.';
    return this.updateOrder({ ...order, status: 'Confirmado', effectiveDate }, 'Confirmación');
  }
  cancelOrder(id: string) {
    const order = this.orders().find(item => item.id === id);
    if (!order || order.status !== 'Pendiente') return 'Solo se pueden anular compras pendientes.';
    const affected: string[] = [];
    for (const item of order.items) {
      const product = this.products().find(product => product.id === item.productId);
      const remaining = (product?.quantity ?? 0) + this.pendingPurchaseWeight(item.productId)
        - this.lineWeight(order.items, item.productId) - this.pendingSaleWeight(item.productId);
      if (remaining < -0.000001) {
        let backing = (product?.quantity ?? 0) + this.pendingPurchaseWeight(item.productId) - this.lineWeight(order.items, item.productId);
        const sales = this.sales().filter(sale => sale.status === 'Pendiente' && sale.items.some(line => line.productId === item.productId))
          .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
        const uncovered: string[] = [];
        for (const sale of sales) {
          const quantity = this.lineWeight(sale.items, item.productId);
          if (quantity > backing + 0.000001) uncovered.push(`${sale.id} · ${sale.customer} (${weight(quantity - Math.max(0, backing))})`);
          backing -= quantity;
        }
        affected.push(`${productName(item.category, item.length)}: faltan ${weight(-remaining)}; reservas sin respaldo: ${uncovered.join(', ')}`);
      }
    }
    if (affected.length) return `No se puede anular esta compra porque dejaría reservas sin respaldo. ${affected.join('. ')}`;
    const cancelledAt = new Date().toISOString();
    const cancelled = { ...order, status: 'Anulada' as const };
    const change = operationChange(order, cancelled, 'Anulación', cancelledAt);
    this.orders.update(orders => orders.map(entry => entry.id === id
      ? { ...cancelled, cancelledAt, changeHistory: change ? [...(order.changeHistory ?? []), change] : order.changeHistory } : entry));
    return '';
  }
  updateSale(item: Sale, usePending = false, reason: OperationChange['reason'] = 'Edición'): SaleResult | { kind: 'error'; message: string } {
    const previous = this.sales().find(sale => sale.id === item.id);
    if (!previous) return { kind: 'error', message: 'No encontramos la venta que deseas editar.' };
    if (previous.status === 'Anulada') return { kind: 'error', message: 'Una venta anulada no se puede editar.' };
    if (item.status === 'Anulada') return { kind: 'error', message: 'Usa la acción Anular para cancelar una venta pendiente.' };
    const assessment = this.assessSale(item.items, previous);
    if (assessment.kind === 'error') return assessment;
    if (assessment.kind === 'insufficient') return assessment;
    if (assessment.kind === 'needs-pending' && !usePending) return assessment;
    const status = assessment.kind === 'needs-pending' ? 'Pendiente' : item.status;
    const updated = { ...item, status, effectiveDate: status === 'Confirmado' ? item.effectiveDate ?? item.date : undefined };
    const dateError = this.effectiveDateError(updated);
    if (dateError) return { kind: 'error', message: dateError };
    const modifiedAt = new Date().toISOString();
    const change = operationChange(previous, updated, reason, modifiedAt);
    if (!change) return { kind: 'saved', status };
    if (status === 'Confirmado') {
      const candidateSales = this.sales().map(sale => sale.id === item.id ? updated : sale);
      const shortage = calculateFifo(this.initialLots, this.orders(), candidateSales).shortages[0];
      if (shortage) return { kind: 'error', message: this.fifoShortageMessage(shortage.productId, shortage.quantity) };
    }
    this.products.update(products => products.map(product => {
      const oldQuantity = previous.status === 'Confirmado' ? this.lineWeight(previous.items, product.id) : 0;
      const newQuantity = status === 'Confirmado' ? this.lineWeight(item.items, product.id) : 0;
      return { ...product, quantity: product.quantity + oldQuantity - newQuantity, sold: product.sold - oldQuantity + newQuantity };
    }));
    this.sales.update(sales => sales.map(sale => sale.id === item.id
      ? { ...updated, modifiedAt, changeHistory: [...(previous.changeHistory ?? []), change] } : sale));
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
    for (const item of sale.items) {
      const product = this.products().find(entry => entry.id === item.productId);
      if (!product || product.quantity < item.quantity) return `Aún no hay stock físico suficiente de ${productName(item.category, item.length)} para confirmar esta venta.`;
    }
    const result = this.updateSale({ ...sale, status: 'Confirmado', effectiveDate }, false, 'Confirmación');
    return result.kind === 'saved' ? '' : result.kind === 'error' ? result.message : 'Esta venta aún depende de stock pendiente.';
  }
  cancelSale(id: string) {
    const sale = this.sales().find(item => item.id === id);
    if (!sale || sale.status !== 'Pendiente') return 'Solo se pueden anular ventas pendientes.';
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
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
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
export const unitPriceLabel = (value: number) => `Bs. ${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 12 }).format(value)}`;
export const weight = (grams: number) => grams >= 1000 ? `${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 }).format(grams / 1000)} kg` : `${new Intl.NumberFormat('es-BO').format(grams)} g`;
export const categoryLabel = (value: HairCategory) => value.charAt(0).toUpperCase() + value.slice(1);
export const productName = (category: HairCategory, length: HairLength) => `Cabello ${category} ${length} cm`;
export const operationName = (date: string, party: string) => `${dateLabel(date)} · ${party}`;
export const operationWeight = (items: HairLine[]) => items.reduce((sum, item) => sum + item.quantity, 0);
export const operationValue = (items: HairLine[]) => sumMoney(items.map(item => lineValue(item.quantity, item.unitPrice)));
export const operationEffectiveDate = (item: Order | Sale) => item.effectiveDate ?? item.date;
export const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
export const dateLabel = (value: string) => value ? new Intl.DateTimeFormat('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : '—';
export const modifiedLabel = (value: string) => new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
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
