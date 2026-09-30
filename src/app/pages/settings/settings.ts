import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DemoStore, Role } from '../../data/demo-store';

@Component({selector:'app-settings',standalone:true,imports:[FormsModule],templateUrl: './settings.html',
  styleUrl: './settings.css'})
export class Settings {readonly store=inject(DemoStore);setRole(value:Role){this.store.role.set(value);}}
