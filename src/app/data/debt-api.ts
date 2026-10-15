export type DebtSummary = {
  id: string; party: string; phone: string; kind: 'RECEIVABLE' | 'PAYABLE';
  total: number; paid: number; balance: number; openedOn: string; dueOn: string;
  notes: string; status: 'PAID' | 'OVERDUE' | 'PARTIAL' | 'PENDING';
  createdAt: string; updatedAt: string; version: number;
};
export type DebtPayment = {
  id: string; paidOn: string; amount: number; note: string;
  recordedAt: string; updatedAt: string | null; voidedAt: string | null;
};
export type DebtHistory = {
  id: number; paymentId: string | null; changedAt: string; eventType: string;
  actorUserId: string; reason: string | null; oldValues: unknown; newValues: unknown;
};
export type DebtDetail = { debt: DebtSummary; payments: DebtPayment[]; history: DebtHistory[] };
