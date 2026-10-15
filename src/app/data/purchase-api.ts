export type PurchaseStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED';

export type PurchaseSummary = {
  id: string;
  supplierId: string;
  supplierName: string;
  operationDate: string;
  status: PurchaseStatus;
  createdAt: string;
  confirmedAt: string | null;
  canceledAt: string | null;
  updatedAt: string | null;
  version: number;
  agreedWeight: number;
  receivedWeight: number;
  agreedTotal: number;
  receivedValue: number;
  payableTotal: number;
  paidTotal: number;
  balance: number;
};

export type PurchaseLine = {
  id: string;
  categoryCode: string;
  categoryName: string;
  lengthCm: number;
  agreedWeight: number;
  receivedWeight: number;
  remainingWeight: number;
  pricePerGram: number;
  agreedTotal: number;
  receivedValue: number;
};

export type PurchaseReceipt = {
  id: string;
  effectiveAt: string;
  recordedAt: string;
  voidedAt: string | null;
  items: { id: string; lineId: string; weight: number }[];
};

export type PurchasePayment = {
  id: string;
  paymentDate: string;
  amount: number;
  method: 'CASH' | 'QR' | 'TRANSFER' | 'OTHER';
  reference: string;
  recordedAt: string;
  updatedAt: string | null;
  voidedAt: string | null;
};

export type PurchaseHistory = {
  id: number;
  changedAt: string;
  eventType: string;
  actorUserId: string;
  reason: string | null;
  oldValues: unknown;
  newValues: unknown;
};

export type PurchaseDetail = {
  summary: PurchaseSummary;
  lines: PurchaseLine[];
  receipts: PurchaseReceipt[];
  payments: PurchasePayment[];
  history: PurchaseHistory[];
};
