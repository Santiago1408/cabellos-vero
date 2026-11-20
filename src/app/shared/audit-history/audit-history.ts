import { DatePipe } from '@angular/common';
import { Component, Input } from '@angular/core';

export type AuditEvent = { id: number; changedAt: string; eventType: string; reason: string | null; actorName?: string; oldValues: unknown; newValues: unknown };
export type HistoryField = { label: string; value: string };
const labels: Record<string, string> = {
  branch: 'Sucursal', name: 'Nombre', active: 'Activa', ownerName: 'Dueño', kind: 'Movimiento', label: 'Identificación', seller: 'Comprado a', note: 'Detalle', originalWeight: 'Peso original', remainingWeight: 'Peso disponible', originalCost: 'Costo original', remainingCost: 'Costo disponible', cost: 'Costo', adminShare: 'Utilidad del administrador', ownerShare: 'Utilidad del dueño', sources: 'Origen', items: 'Porciones',
  supplierId: 'Proveedor', supplierName: 'Proveedor', customerName: 'Cliente', operationDate: 'Fecha de operación',
  acceptedPendingStock: 'Acepta cabello por recibir', deliveredFinalWeight: 'Peso entregado con ligas', consumedLots: 'Lotes utilizados', costPerGram: 'Costo por gramo', receivedAt: 'Fecha de recepción del lote',
  status: 'Estado', lines: 'Cabellos', categoryCode: 'Categoría', categoryName: 'Categoría', lengthCm: 'Longitud',
  agreedWeight: 'Peso acordado', receivedWeight: 'Peso recibido', deliveredWeight: 'Peso entregado',
  finalWeight: 'Peso con ligas', agreedFinalWeight: 'Peso acordado con ligas', weight: 'Peso', pricePerGram: 'Precio por gramo',
  purchase: 'Compra', sale: 'Venta', receipt: 'Recepción', delivery: 'Entrega',
  effectiveAt: 'Fecha efectiva', recordedAt: 'Fecha de registro', voidedAt: 'Anulación', payment: 'Pago o cobro',
  paymentDate: 'Fecha de pago', amount: 'Importe', method: 'Método', reference: 'Referencia',
  payableTotal: 'Total a pagar', paidTotal: 'Total pagado', balance: 'Saldo', agreedTotal: 'Total acordado',
  receivedValue: 'Valor recibido', deliveredValue: 'Valor entregado', total: 'Total',
};
const values: Record<string, string> = { PENDING: 'Pendiente', CONFIRMED: 'Confirmado', CANCELED: 'Anulado', CASH: 'Efectivo', QR: 'QR', TRANSFER: 'Transferencia', OTHER: 'Otro', CAPITAL: 'Aporte de capital', ADVANCE: 'Anticipo', EXPENSE: 'Gasto', ADVANCE_RETURN: 'Devolución de anticipo', ADMIN_PROFIT: 'Entrega al administrador', OWNER_WITHDRAWAL: 'Retiro del dueño', PURCHASE: 'Compra', SALE: 'Venta', MIX: 'Mezcla' };
const events: Record<string, string> = {
  OWNER_REMOVED: 'Dueño eliminado de la sucursal',
  BRANCH_CREATED: 'Sucursal creada', BRANCH_UPDATED: 'Sucursal modificada', OWNER_ASSIGNED: 'Dueño reasignado', HEAD_PURCHASED: 'Cabeza comprada', HEADS_MIXED: 'Mezcla registrada', HEAD_SOLD: 'Venta de cabello', CASH_RECORDED: 'Movimiento de dinero', DELIVERY_CONFIRMED: 'Dinero recibido por el administrador', MOVEMENT_VOIDED: 'Movimiento anulado', MIX_VOIDED: 'Mezcla anulada',
  PURCHASE_CREATED: 'Compra registrada', PURCHASE_UPDATED: 'Compra modificada', PURCHASE_CANCELED: 'Compra anulada',
  SALE_CREATED: 'Venta registrada', SALE_UPDATED: 'Venta modificada', SALE_CANCELED: 'Venta anulada',
  RECEIPT_RECORDED: 'Recepción registrada', RECEIPT_CORRECTED: 'Recepción corregida', RECEIPT_VOIDED: 'Recepción anulada',
  DELIVERY_RECORDED: 'Entrega registrada', DELIVERY_CORRECTED: 'Entrega corregida', DELIVERY_VOIDED: 'Entrega anulada',
  PAYMENT_RECORDED: 'Pago registrado', PAYMENT_CORRECTED: 'Pago corregido', PAYMENT_VOIDED: 'Pago anulado',
  COLLECTION_RECORDED: 'Cobro registrado', COLLECTION_CORRECTED: 'Cobro corregido', COLLECTION_VOIDED: 'Cobro anulado',
};
export function historyFields(value: unknown, names: Record<string, string> = {}, prefix = ''): HistoryField[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, raw]) => {
    if (key === 'id' || key.endsWith('Id') && key !== 'supplierId' || key === 'version') return [];
    const label = [prefix, labels[key] ?? key.replace(/([A-Z])/g, ' $1')].filter(Boolean).join(' · ');
    if (Array.isArray(raw)) return raw.flatMap((item, index) => historyFields(item, names, `${label} ${index + 1}`));
    if (raw && typeof raw === 'object') return historyFields(raw, names, label);
    let formatted = raw === null ? '—' : names[String(raw)] ?? values[String(raw)] ?? String(raw || '—');
    if (typeof raw === 'boolean') formatted = raw ? 'Sí' : 'No';
    if (typeof raw === 'number') {
      formatted = new Intl.NumberFormat('es-BO', { minimumFractionDigits: key === 'lengthCm' ? 0 : 2, maximumFractionDigits: 2 }).format(raw);
      formatted += key === 'lengthCm' ? ' cm' : /weight/i.test(key) ? ' g' : /amount|total|balance|value|price|cost/i.test(key) ? (key.endsWith('PerGram') ? ' Bs./g' : ' Bs.') : '';
    } else if (typeof raw === 'string' && /^\d{4}-\d\d-\d\d/.test(raw)) {
      formatted = raw.length === 10 ? raw.split('-').reverse().join('/') : new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date(raw));
    }
    return [{ label, value: formatted }];
  });
}
@Component({
  selector: 'app-audit-history', standalone: true, imports: [DatePipe],
  template: `
    <details class="audit-history"><summary>Historial de cambios ({{ entries.length }})</summary>
      <ol>@for (entry of entries; track entry.id) {
        <li><header><strong>{{ eventLabel(entry.eventType) }}</strong><time>{{ entry.changedAt | date:'dd/MM/yyyy HH:mm':'-0400':'es-BO' }}</time></header>
          @if (entry.actorName) { <p>Registrado por {{ entry.actorName }}</p> }
          @if (entry.reason) { <p class="audit-reason">Motivo: {{ entry.reason }}</p> }
          <div class="audit-comparison">
            <section><h4>Antes</h4><dl>@for (field of fields(entry.oldValues); track $index) { <div><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div> } @empty { <p>Sin datos anteriores.</p> }</dl></section>
            <section><h4>Después</h4><dl>@for (field of fields(entry.newValues); track $index) { <div><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></div> } @empty { <p>Sin datos nuevos.</p> }</dl></section>
          </div>
        </li>
      } @empty { <li>No hay cambios registrados.</li> }</ol>
    </details>`,
  styleUrl: './audit-history.css',
})
export class AuditHistory {
  @Input() entries: AuditEvent[] = [];
  @Input() names: Record<string, string> = {};
  fields(value: unknown): HistoryField[] { return historyFields(value, this.names); }
  eventLabel(value: string): string { return events[value] ?? value.replaceAll('_', ' ').toLocaleLowerCase('es-BO'); }
}
