import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoStore, dateLabel } from '../../data/demo-store';
import { downloadCompleteBackup } from '../../data/backup-csv';

@Component({selector:'app-settings',standalone:true,imports:[FormsModule],templateUrl: './settings.html',
  styleUrl: './settings.css'})
export class Settings {
  readonly store = inject(DemoStore);
  readonly dateLabel = dateLabel;
  adminName = this.store.displayName();
  backupPassword = '';
  backupConfirmation = '';
  readonly backupError = signal('');
  saveAdminName() { this.store.renameAdmin(this.adminName); this.adminName = this.store.displayName(); }
  async downloadBackup() {
    if (this.backupPassword.length < 12) {
      this.backupError.set('Usa una contraseña de al menos 12 caracteres para cifrar el respaldo.');
      return;
    }
    if (this.backupPassword !== this.backupConfirmation) {
      this.backupError.set('Las contraseñas no coinciden.');
      return;
    }
    try {
      await downloadCompleteBackup(this.store, this.backupPassword);
      this.backupPassword = '';
      this.backupConfirmation = '';
      this.backupError.set('');
    } catch {
      this.backupError.set('No se pudo cifrar el respaldo. Inténtalo desde un navegador actualizado.');
    }
  }
}
