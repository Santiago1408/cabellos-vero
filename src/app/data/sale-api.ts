export type SaleStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED';

export type SaleSummary = {
  id: string;
  customerName: string;
  operationDate: string;
  acceptedPendingStock: boolean;
  status: SaleStatus;
  createdAt: string;
  confirmedAt: string | null;
  canceledAt: string | null;
  updatedAt: string | null;
  version: number;
  agreedWeight: number;
  deliveredWeight: number;
  finalWeight: number;
  deliveredFinalWeight: number;
  agreedTotal: number;
  deliveredValue: number;
  payableTotal: number;
  paidTotal: number;
  balance: number;
};

export type SaleLine = {
  id: string;
  categoryCode: string;
  categoryName: string;
  lengthCm: number;
  agreedWeight: number;
  deliveredWeight: number;
  remainingWeight: number;
  finalWeight: number;
  deliveredFinalWeight: number;
  remainingFinalWeight: number;
  pricePerGram: number;
  agreedTotal: number;
  deliveredValue: number;
};

export type SaleConsumption = {
  stockLotId: string;
  weight: number;
  costPerGram: number;
  receivedAt: string;
  purchaseId: string | null;
  supplierName: string;
};

export type SaleDelivery = {
  id: string;
  effectiveAt: string;
  recordedAt: string;
  voidedAt: string | null;
  items: { id: string; lineId: string; weight: number; finalWeight: number; consumedLots: SaleConsumption[] }[];
};

export type SalePayment = {
  id: string;
  paymentDate: string;
  amount: number;
  method: 'CASH' | 'QR' | 'TRANSFER' | 'OTHER';
  reference: string;
  recordedAt: string;
  updatedAt: string | null;
  voidedAt: string | null;
};

export type SaleHistory = {
  id: number;
  changedAt: string;
  eventType: string;
  actorUserId: string;
  reason: string | null;
  oldValues: unknown;
  newValues: unknown;
};

export type SaleDetail = {
  summary: SaleSummary;
  lines: SaleLine[];
  deliveries: SaleDelivery[];
  payments: SalePayment[];
  history: SaleHistory[];
};

export type SaleAvailabilityIssue = {
  categoryCode: string;
  lengthCm: number;
  requested: number;
  physicalAvailable: number;
  pendingAvailable: number;
  missing: number;
};

export type SaleApiError = {
  code: string;
  error: string;
  details: SaleAvailabilityIssue[];
};
