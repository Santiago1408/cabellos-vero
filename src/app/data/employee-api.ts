export type EmployeeSummary = {
  id: string; username: string; fullName: string; ci: string; birthDate: string; phone: string;
  active: boolean; mustChangePassword: boolean; createdAt: string; updatedAt: string;
};
export type EmployeeHistory = {
  id: number; changedAt: string; eventType: string; source: string;
  actorUserId: string; reason: string | null; oldValues: unknown; newValues: unknown;
};
export type EmployeeDetail = { employee: EmployeeSummary; history: EmployeeHistory[] };
export type TemporaryPassword = { employee: EmployeeSummary; temporaryPassword: string };
