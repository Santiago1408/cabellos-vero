import type { Order, Product, Sale } from './demo-store';

export type OpeningLot = { productId: string; quantity: number; unitCost: number };
export type FifoAllocation = {
  saleId: string;
  productId: string;
  lotId: string;
  supplier: string;
  purchaseDate: string;
  quantity: number;
  unitCost: number;
};
export type FifoShortage = { saleId: string; productId: string; quantity: number };
export type FifoResult = { allocations: FifoAllocation[]; remainingValue: number; shortages: FifoShortage[] };

type Lot = { id: string; productId: string; supplier: string; date: string; remaining: number; unitCost: number };
const byDate = (a: { date: string; id: string }, b: { date: string; id: string }) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

export function calculateFifo(opening: OpeningLot[], orders: Order[], sales: Sale[]): FifoResult {
  const lots: Lot[] = opening.filter(item => item.quantity > 0).map(item => ({
    id: `INICIAL-${item.productId}`, productId: item.productId, supplier: 'Saldo inicial',
    date: '', remaining: item.quantity, unitCost: item.unitCost,
  }));
  const events = [
    ...orders.filter(order => order.status === 'Confirmado').map(order => ({ kind: 'purchase' as const, date: order.date, id: order.id, order })),
    ...sales.filter(sale => sale.status === 'Confirmado').map(sale => ({ kind: 'sale' as const, date: sale.date, id: sale.id, sale })),
  ].sort((a, b) => byDate(a, b) || (a.kind === 'purchase' ? -1 : 1));
  const allocations: FifoAllocation[] = [];
  const shortages: FifoShortage[] = [];
  for (const event of events) {
    if (event.kind === 'purchase') {
      for (const item of event.order.items) lots.push({
        id: event.order.id, productId: item.productId, supplier: event.order.supplier,
        date: event.order.date, remaining: item.quantity, unitCost: item.unitPrice,
      });
      continue;
    }
    for (const item of event.sale.items) {
      let missing = item.quantity;
      for (const lot of lots) {
        if (lot.productId !== item.productId || lot.remaining <= 0 || missing <= 0) continue;
        const quantity = Math.min(missing, lot.remaining);
        allocations.push({ saleId: event.sale.id, productId: item.productId, lotId: lot.id,
          supplier: lot.supplier, purchaseDate: lot.date, quantity, unitCost: lot.unitCost });
        lot.remaining -= quantity;
        missing -= quantity;
      }
      if (missing > 0.000001) shortages.push({ saleId: event.sale.id, productId: item.productId, quantity: missing });
    }
  }
  return { allocations, remainingValue: lots.reduce((sum, lot) => sum + lot.remaining * lot.unitCost, 0), shortages };
}

export function openingLots(products: Product[], orders: Order[], sales: Sale[]): OpeningLot[] {
  return products.map(product => {
    const confirmedPurchases = orders.filter(order => order.status === 'Confirmado')
      .flatMap(order => order.items).filter(item => item.productId === product.id)
      .reduce((sum, item) => sum + item.quantity, 0);
    const confirmedSales = sales.filter(sale => sale.status === 'Confirmado')
      .flatMap(sale => sale.items).filter(item => item.productId === product.id)
      .reduce((sum, item) => sum + item.quantity, 0);
    return { productId: product.id, quantity: product.quantity - confirmedPurchases + confirmedSales,
      unitCost: product.purchasePrice };
  });
}
