import { eventDate, eventValue, operationEvents, type Order, type Sale } from './demo-store';
import type { FifoAllocation } from './fifo';
import { sumMoney } from './money';

export type ReportPeriod = 'days' | 'weeks' | 'months';
export type PeriodSummary = { key: string; label: string; purchases: number; sales: number; costs: number; profit: number };

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const shortDate = (date: Date) => new Intl.DateTimeFormat('es-BO', {
  day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC',
}).format(date);

export function summarizePeriods(period: ReportPeriod, today: string, orders: Order[], sales: Sale[], allocations: FifoAllocation[]): PeriodSummary[] {
  const current = new Date(`${today}T00:00:00Z`);
  const currentWeek = addDays(current, -((current.getUTCDay() + 6) % 7));
  const costsByEvent = new Map<string, number>();
  for (const item of allocations) costsByEvent.set(item.saleEventId,
    sumMoney([costsByEvent.get(item.saleEventId) ?? 0, item.cost]));

  const count = period === 'days' ? 30 : period === 'weeks' ? 12 : 6;
  return Array.from({ length: count }, (_, index) => {
    let start: Date;
    let end: Date;
    let label: string;
    if (period === 'days') {
      start = addDays(current, index - count + 1);
      end = addDays(start, 1);
      label = shortDate(start);
    } else if (period === 'weeks') {
      start = addDays(currentWeek, (index - count + 1) * 7);
      end = addDays(start, 7);
      label = `${shortDate(start)} – ${shortDate(addDays(end, -1))}`;
    } else {
      start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + index - count + 1, 1));
      end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      label = new Intl.DateTimeFormat('es-BO', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(start);
    }
    const startKey = dateKey(start);
    const endKey = dateKey(end);
    const inPeriod = (at: string) => at >= startKey && at < endKey;
    const purchases = orders.flatMap(order => operationEvents(order)
      .filter(event => inPeriod(eventDate(event))).map(event => eventValue(order, event)));
    const includedSales = sales.flatMap(sale => operationEvents(sale)
      .filter(event => inPeriod(eventDate(event))).map(event => ({ sale, event })));
    const income = sumMoney(includedSales.map(({ sale, event }) => eventValue(sale, event)));
    const costs = sumMoney(includedSales.map(({ event }) => costsByEvent.get(event.id) ?? 0));
    return { key: startKey, label, purchases: sumMoney(purchases), sales: income, costs, profit: sumMoney([income, -costs]) };
  });
}
