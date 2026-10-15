export type ReportOverview = {
  receivedPurchases: number;
  salesRevenue: number;
  hairCost: number;
  grossMargin: number;
  stockCostValue: number;
  salesWithDeliveries: number;
};

export type ReportPeriod = 'days' | 'weeks' | 'months';
export type ReportRow = {
  start: string;
  endExclusive: string;
  purchases: number;
  sales: number;
  costs: number;
  grossMargin: number;
};
export type PeriodReport = { period: ReportPeriod; asOf: string; rows: ReportRow[] };
export type TopProduct = {
  categoryCode: string;
  categoryName: string;
  lengthCm: number;
  soldWeight: number;
  salesRevenue: number;
  hairCost: number;
  grossMargin: number;
  physicalStock: number;
};
export type TopCategory = {
  categoryCode: string;
  categoryName: string;
  soldWeight: number;
  salesRevenue: number;
  sharePercent: number;
};
