import { eventLines, fulfilledQuantity, operationEvents, type Order, type Product, type Sale } from './demo-store';
import { amountCents } from './money';

export type OpeningLot = { productId: string; quantity: number; unitCost: number };
export type FifoAllocation = {
  saleId: string;
  saleEventId: string;
  productId: string;
  lotId: string;
  supplier: string;
  purchaseDate: string;
  quantity: number;
  unitCost: number;
  cost: number;
};
export type FifoShortage = { saleId: string; productId: string; quantity: number };
export type FifoResult = { allocations: FifoAllocation[]; remainingValue: number; shortages: FifoShortage[] };

type Lot = { id: string; productId: string; supplier: string; date: string; remaining: number; unitCost: number; original: number; valueCents: number; allocatedCents: number };
const byDate = (a: { date: string; id: string }, b: { date: string; id: string }) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

export function calculateFifo(opening: OpeningLot[], orders: Order[], sales: Sale[]): FifoResult {
  const lots: Lot[] = opening.filter(item => item.quantity > 0).map(item => ({
    id: `INICIAL-${item.productId}`, productId: item.productId, supplier: 'Saldo inicial',
    date: '', remaining: item.quantity, unitCost: item.unitCost, original: item.quantity,
    valueCents: amountCents(item.quantity, item.unitCost), allocatedCents: 0,
  }));
  const events = [
    ...orders.flatMap(order => operationEvents(order).map(fulfillment => ({ kind: 'purchase' as const,
      date: fulfillment.at, id: fulfillment.id, order, fulfillment }))),
    ...sales.flatMap(sale => operationEvents(sale).map(fulfillment => ({ kind: 'sale' as const,
      date: fulfillment.at, id: fulfillment.id, sale, fulfillment }))),
  ].sort((a, b) => byDate(a, b) || (a.kind === b.kind ? 0 : a.kind === 'purchase' ? -1 : 1));
  const allocations: FifoAllocation[] = [];
  const shortages: FifoShortage[] = [];
  for (const event of events) {
    if (event.kind === 'purchase') {
      for (const item of eventLines(event.order, event.fulfillment)) {
        const earlier = operationEvents(event.order).slice(0, operationEvents(event.order)
          .findIndex(entry => entry.id === event.id));
        const before = earlier.flatMap(entry => entry.items).filter(entry => entry.productId === item.productId)
          .reduce((sum, entry) => sum + entry.quantity, 0);
        lots.push({
          id: event.id, productId: item.productId, supplier: event.order.supplier,
          date: event.date, remaining: item.quantity, unitCost: item.unitPrice,
          original: item.quantity, valueCents: amountCents(before + item.quantity, item.unitPrice)
            - amountCents(before, item.unitPrice), allocatedCents: 0,
        });
      }
      continue;
    }
    for (const item of eventLines(event.sale, event.fulfillment)) {
      let missing = item.quantity;
      for (const lot of lots) {
        if (lot.productId !== item.productId || lot.remaining <= 0 || missing <= 0) continue;
        const quantity = Math.min(missing, lot.remaining);
        const consumedCents = Math.round(Math.min(Math.round(lot.original * 100),
          Math.round((lot.original - lot.remaining + quantity) * 100))
          / Math.round(lot.original * 100) * lot.valueCents);
        const cost = (consumedCents - lot.allocatedCents) / 100;
        allocations.push({ saleId: event.sale.id, saleEventId: event.id, productId: item.productId, lotId: lot.id,
          supplier: lot.supplier, purchaseDate: lot.date, quantity, unitCost: lot.unitCost, cost });
        lot.allocatedCents = consumedCents;
        lot.remaining -= quantity;
        missing -= quantity;
      }
      if (missing > 0.000001) shortages.push({ saleId: event.sale.id, productId: item.productId, quantity: missing });
    }
  }
  return { allocations, remainingValue: lots.reduce((sum, lot) =>
    sum + lot.valueCents - lot.allocatedCents, 0) / 100, shortages };
}

export function openingLots(products: Product[], orders: Order[], sales: Sale[]): OpeningLot[] {
  return products.map(product => {
    const confirmedPurchases = orders.reduce((sum, order) => sum + fulfilledQuantity(order, product.id), 0);
    const confirmedSales = sales.reduce((sum, sale) => sum + fulfilledQuantity(sale, product.id), 0);
    return { productId: product.id, quantity: product.quantity - confirmedPurchases + confirmedSales,
      unitCost: product.purchasePrice };
  });
}
