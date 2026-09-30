import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { DemoStore, HairLine, Order, Sale, operationValue, todayLocal } from './demo-store';

const line = (store: DemoStore, category: string, length: number, quantity: number, unitPrice: number): HairLine => {
  const product = store.products().find(item => item.category === category && item.length === length);
  return { productId: product?.id ?? '', category, length, quantity, unitPrice };
};
const purchase = (store: DemoStore, id: string, date: string, category: string, length: number, quantity: number, unitPrice: number, status: Order['status'] = 'Confirmado') =>
  store.addOrder({ id, supplier: 'Peluquería', date, status, items: [line(store, category, length, quantity, unitPrice)] });
const sale = (store: DemoStore, id: string, date: string, items: HairLine[], status: Sale['status'] = 'Confirmado') =>
  store.addSale({ id, customer: 'Cliente', date, status, items });

describe('stock y costo FIFO', () => {
  it('permite comprar una combinación existente que aún no tiene producto', () => {
    const store = new DemoStore();
    expect(store.products().some(product => product.category === 'tinturado' && product.length === 70)).toBe(false);
    purchase(store, 'COMP-NUEVA', '2026-09-29', 'tinturado', 70, 400, 13, 'Pendiente');
    const product = store.products().find(item => item.category === 'tinturado' && item.length === 70);
    expect(product).toBeDefined();
    expect(product?.quantity).toBe(0);
    expect(store.managedProducts().some(item => item.id === product?.id)).toBe(false);
    expect(store.confirmOrder('COMP-NUEVA')).toBe('');
    expect(store.managedProducts().find(item => item.id === product?.id)?.quantity).toBe(400);
  });

  it('rechaza toda la venta si cualquier línea no tiene respaldo, incluso al aceptar compras pendientes', () => {
    const store = new DemoStore();
    store.addCategory('ondulado');
    purchase(store, 'COMP-PENDIENTE', '2026-09-29', 'ondulado', 38, 100, 10, 'Pendiente');
    const items = [line(store, 'ondulado', 38, 150, 20), line(store, 'ondulado', 40, 500, 20)];
    const first = sale(store, 'VTA-RECHAZADA', '2026-09-30', items);
    expect(first.kind).toBe('insufficient');
    if (first.kind === 'insufficient') {
      expect(first.shortages).toHaveLength(2);
      expect(first.shortages.map(item => item.missing)).toEqual([50, 500]);
    }
    const accepted = store.addSale({ id: 'VTA-RECHAZADA', customer: 'Cliente', date: '2026-09-30', status: 'Confirmado', items }, true);
    expect(accepted.kind).toBe('insufficient');
    expect(store.sales().some(item => item.id === 'VTA-RECHAZADA')).toBe(false);
  });

  it('descuenta primero el lote más antiguo y calcula el margen real', () => {
    const store = new DemoStore();
    store.addCategory('ondulado');
    purchase(store, 'COMP-A', '2026-09-10', 'ondulado', 70, 400, 13);
    purchase(store, 'COMP-B', '2026-09-11', 'ondulado', 70, 600, 15);
    const result = sale(store, 'VTA-FIFO', '2026-09-12', [line(store, 'ondulado', 70, 500, 20)]);
    expect(result).toEqual({ kind: 'saved', status: 'Confirmado' });
    expect(store.fifo().allocations.filter(item => item.saleId === 'VTA-FIFO').map(item => [item.lotId, item.quantity])).toEqual([
      ['COMP-A', 400], ['COMP-B', 100],
    ]);
    expect(store.saleCost('VTA-FIFO')).toBe(6700);
    expect(operationValue(store.sales().find(item => item.id === 'VTA-FIFO')!.items) - store.saleCost('VTA-FIFO')).toBe(3300);
    expect(store.products().find(item => item.category === 'ondulado' && item.length === 70)?.quantity).toBe(500);
  });

  it('usa el saldo inicial como primer lote al costo ficticio existente', () => {
    const store = new DemoStore();
    expect(store.fifo().shortages).toEqual([]);
    const opening = store.initialLots.find(item => item.productId === 'CAB-001');
    expect(opening).toEqual({ productId: 'CAB-001', quantity: 1250, unitCost: 2.2 });
    expect(store.saleCost('VTA-2087')).toBeGreaterThan(0);
  });

  it('impide mover una compra después de una venta que depende de su lote', () => {
    const store = new DemoStore();
    store.addCategory('ondulado');
    purchase(store, 'COMP-A', '2026-09-10', 'ondulado', 70, 400, 13);
    sale(store, 'VTA-A', '2026-09-11', [line(store, 'ondulado', 70, 100, 20)]);
    const order = store.orders().find(item => item.id === 'COMP-A')!;
    expect(store.updateOrder({ ...order, date: '2026-09-12' })).toContain('fecha de la venta');
    expect(store.orders().find(item => item.id === 'COMP-A')?.date).toBe('2026-09-10');
  });

  it('calcula meses sin movimientos como cero y evita alertas de tipos nuevos', () => {
    const store = new DemoStore();
    const before = store.managedProducts().length;
    store.addCategory('ondulado');
    expect(store.managedProducts().length).toBe(before);
    const empty = store.monthlySummaries().filter(month => !store.orders().some(order => order.status === 'Confirmado' && order.date.startsWith(month.key))
      && !store.sales().some(item => item.status === 'Confirmado' && item.date.startsWith(month.key)));
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every(month => month.purchases === 0 && month.sales === 0 && month.profit === 0)).toBe(true);
    const date = todayLocal();
    const monthBefore = store.monthlySummaries().find(month => month.key === date.slice(0, 7))!;
    purchase(store, 'COMP-MES', date, 'ondulado', 70, 100, 10);
    sale(store, 'VTA-MES', date, [line(store, 'ondulado', 70, 50, 30)]);
    const monthAfter = store.monthlySummaries().find(month => month.key === date.slice(0, 7))!;
    expect(monthAfter.purchases - monthBefore.purchases).toBe(1000);
    expect(monthAfter.sales - monthBefore.sales).toBe(1500);
    expect(monthAfter.costs - monthBefore.costs).toBe(500);
    expect(monthAfter.profit - monthBefore.profit).toBe(1000);
  });
});
