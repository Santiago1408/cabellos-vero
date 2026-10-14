import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoStore, dateLabel } from '../../data/demo-store';

@Component({selector:'app-settings',standalone:true,imports:[FormsModule],templateUrl: './settings.html',
  styleUrl: './settings.css'})
export class Settings {
  readonly store = inject(DemoStore);
  readonly dateLabel = dateLabel;
  adminName = this.store.displayName();
  saveAdminName() { this.store.renameAdmin(this.adminName); this.adminName = this.store.displayName(); }
}
