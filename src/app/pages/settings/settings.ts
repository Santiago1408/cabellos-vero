import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoStore, dateLabel, modifiedLabel } from '../../data/demo-store';
import { downloadCompleteBackup } from '../../data/backup-csv';

@Component({selector:'app-settings',standalone:true,imports:[FormsModule],templateUrl: './settings.html',
  styleUrl: './settings.css'})
export class Settings {
  readonly store = inject(DemoStore);
  readonly dateLabel = dateLabel;
  readonly modifiedLabel = modifiedLabel;
  adminName = this.store.displayName();
  backupIntervalDraft = this.store.backupIntervalDays();
  readonly backupIntervalError = signal('');
  readonly backupError = signal('');
  saveAdminName() { this.store.renameAdmin(this.adminName); this.adminName = this.store.displayName(); }
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
