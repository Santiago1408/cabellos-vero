import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { AuditHistory, historyFields } from './audit-history';

describe('historial legible de operaciones', () => {
  it('presenta categorías, importes, pesos y estados sin mostrar objetos JSON', () => {
    const fields = historyFields({ purchase: { supplierId: 'supplier', status: 'PENDING', lines: [{lineId: 'hidden', categoryCode: 'natural', lengthCm: 50, agreedWeight: 200, pricePerGram: 4}] }, receipt: { voidedAt: null } }, {supplier: 'María', natural: 'Natural'});
    expect(fields.some(f => f.value === 'María')).toBe(true);
    expect(fields.some(f => f.value === 'Pendiente')).toBe(true);
    expect(fields.some(f => f.value === 'Natural')).toBe(true);
    expect(fields.some(f => f.value.endsWith(' g'))).toBe(true);
    expect(fields.some(f => f.value.endsWith(' Bs./g'))).toBe(true);
    expect(fields.some(f => f.value === 'hidden')).toBe(false);
    expect(fields.some(f => f.value === '[object Object]')).toBe(false);
  });
  it('formatea pagos, fechas sin desplazamiento horario y opciones booleanas', () => {
    expect(historyFields({ paymentDate: '2026-11-20', method: 'CASH', acceptedPendingStock: false })).toEqual([
      {label: 'Fecha de pago', value: '20/11/2026'}, {label: 'Método', value: 'Efectivo'}, {label: 'Acepta cabello por recibir', value: 'No'},
    ]);
    expect(historyFields(null)).toEqual([]);
    expect(new AuditHistory().eventLabel('COLLECTION_CORRECTED')).toBe('Cobro corregido');
  });
});
