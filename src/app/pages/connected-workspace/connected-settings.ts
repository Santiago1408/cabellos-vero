import { DatePipe, KeyValuePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../data/api-client';
import { AuthSession } from '../../data/auth-session';
import { BackupSettings, RestorePreview, RestoreResult } from '../../data/backup-api';

@Component({
  selector: 'app-connected-settings', standalone: true,
  imports: [FormsModule, DatePipe, KeyValuePipe],
  templateUrl: './connected-settings.html',
  styleUrls: ['./connected-settings.css', '../settings/settings.css'],
})
export class ConnectedSettings implements OnInit {
  private readonly api = inject(ApiClient);
  readonly session = inject(AuthSession);
  readonly backupState = output<boolean>();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly backup = signal<BackupSettings | null>(null);
  readonly preview = signal<RestorePreview | null>(null);
  readonly preBackupDownloaded = signal(false);
  readonly preBackupConfirmed = signal(false);
  readonly restored = signal<RestoreResult | null>(null);
  intervalDays: number | null = null;
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  restoreFile: File | null = null;
  restoreConfirmation = '';

  ngOnInit(): void { if (this.session.account()?.role === 'ADMIN') void this.loadBackup(); }
  async loadBackup(): Promise<void> {
    try { const settings = await this.api.get<BackupSettings>('/api/backups/settings'); this.backup.set(settings); this.backupState.emit(settings.due); this.intervalDays = settings.intervalDays; }
    catch (error) { this.error.set(this.errorMessage(error)); }
  }
  async changePassword(): Promise<void> {
    if (this.busy()) return;
    if (this.newPassword.length < 8 || this.newPassword !== this.confirmPassword) { this.error.set('La nueva contraseña debe tener al menos ocho caracteres y coincidir con la confirmación.'); return; }
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await this.session.changePassword(this.currentPassword, this.newPassword); this.currentPassword = ''; this.newPassword = ''; this.confirmPassword = ''; this.message.set('Contraseña actualizada.'); }
    catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async saveInterval(): Promise<void> {
    if (this.busy()) return;
    if (!Number.isInteger(this.intervalDays) || this.intervalDays === null || this.intervalDays < 1 || this.intervalDays > 365) { this.error.set('La frecuencia debe estar entre 1 y 365 días.'); return; }
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { const settings = await this.api.write<BackupSettings>('PUT', '/api/backups/settings', { intervalDays: this.intervalDays }); this.backup.set(settings); this.backupState.emit(settings.due); this.message.set('Frecuencia de respaldo actualizada.'); }
    catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async exportBackup(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { const file = await this.api.download('/api/backups/export'); this.saveFile(file.blob, file.fileName); await this.loadBackup(); this.message.set('La descarga se inició. Comprueba que el archivo esté guardado antes de confirmarlo.'); }
    catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async confirmBackup(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { const settings = await this.api.write<BackupSettings>('POST', '/api/backups/confirm'); this.backup.set(settings); this.backupState.emit(settings.due); this.message.set('Respaldo guardado y confirmado.'); }
    catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  chooseFile(event: Event): void {
    this.restoreFile = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.preview.set(null); this.preBackupDownloaded.set(false); this.preBackupConfirmed.set(false); this.restored.set(null); this.restoreConfirmation = ''; this.error.set('');
  }
  async previewRestore(): Promise<void> {
    if (!this.restoreFile || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { this.preview.set(await this.api.upload<RestorePreview>('/api/backups/restore/preview', this.restoreFile)); }
    catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async downloadPreBackup(): Promise<void> {
    const id = this.preview()?.preparationId; if (!id || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { const file = await this.api.download(`/api/backups/restore/${id}/pre-backup`); this.saveFile(file.blob, file.fileName); this.preBackupDownloaded.set(true); this.preBackupConfirmed.set(false); this.message.set('La copia previa se descargó. Comprueba que quedó guardada.'); }
    catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async confirmPreBackup(): Promise<void> {
    const id = this.preview()?.preparationId; if (!id || !this.preBackupDownloaded() || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await this.api.write('POST', `/api/backups/restore/${id}/confirm-pre-backup`); this.preBackupConfirmed.set(true); this.message.set('Copia previa confirmada. Revisa el resumen antes de restaurar.'); }
    catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  async restore(): Promise<void> {
    const id = this.preview()?.preparationId, file = this.restoreFile;
    if (!id || !file || !this.preBackupConfirmed() || this.busy()) return;
    if (this.restoreConfirmation !== 'RESTAURAR') { this.error.set('Escribe RESTAURAR exactamente para confirmar el reemplazo.'); return; }
    this.busy.set(true); this.error.set('');
    try { const result = await this.api.upload<RestoreResult>(`/api/backups/restore/${id}`, file, { confirmation: 'RESTAURAR' }); this.restored.set(result); this.preview.set(null); this.restoreFile = null; this.restoreConfirmation = ''; await this.loadBackup(); this.message.set(result.message); }
    catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.busy.set(false); }
  }
  private saveFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  private errorMessage(error: unknown): string { return error instanceof HttpErrorResponse && typeof error.error?.error === 'string' ? error.error.error : 'No se pudo completar la operación. Inténtalo nuevamente.'; }
}
