import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DemoStore, dateLabel, modifiedLabel } from '../../data/demo-store';
import { downloadCompleteBackup } from '../../data/backup-csv';

@Component({selector:'app-settings',standalone:true,imports:[FormsModule],templateUrl: './settings.html',
  styleUrl: './settings.css'})
export class Settings {
  readonly store = inject(DemoStore);
  private readonly router = inject(Router);
  readonly dateLabel = dateLabel;
  readonly modifiedLabel = modifiedLabel;
  adminName = this.store.displayName();
  backupIntervalDraft = this.store.backupIntervalDays();
  readonly backupIntervalError = signal('');
  readonly backupError = signal('');
  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';
  readonly passwordError = signal('');
  readonly passwordSuccess = signal(false);
  saveAdminName() { this.store.renameAdmin(this.adminName); this.adminName = this.store.displayName(); }
  saveEmployeePassword() {
    this.passwordSuccess.set(false);
    const wasRequired = this.store.mustChangePassword();
    if (this.newPassword !== this.confirmNewPassword) {
      this.passwordError.set('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    const error = this.store.changeOwnEmployeePassword(this.currentPassword, this.newPassword);
    this.passwordError.set(error);
    if (error) return;
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmNewPassword = '';
    this.passwordSuccess.set(true);
    if (wasRequired) this.router.navigateByUrl('/inventario');
  }
  saveBackupInterval() {
    const error = this.store.setBackupIntervalDays(Number(this.backupIntervalDraft));
    this.backupIntervalError.set(error);
    if (!error) this.backupIntervalDraft = this.store.backupIntervalDays();
  }
  confirmBackupSaved() { this.store.confirmBackupSaved(); }
  downloadBackup() {
    try {
      downloadCompleteBackup(this.store);
      this.store.noteBackupDownloaded();
      this.backupError.set('');
    } catch {
      this.backupError.set('No se pudo descargar el respaldo. Inténtalo nuevamente.');
    }
  }
}
