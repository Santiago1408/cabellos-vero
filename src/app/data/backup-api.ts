export type BackupSettings = {
  intervalDays: number; lastConfirmedAt: string | null; pendingExportAt: string | null;
  nextReminderAt: string | null; due: boolean;
};
export type RestorePreview = {
  preparationId: string; expiresAt: string; fileSha256: string;
  exportedAt: string; counts: Record<string, number>; warning: string;
};
export type RestoreResult = { preparationId: string; fileSha256: string; counts: Record<string, number>; message: string };
