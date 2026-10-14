import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DemoStore, demoAdminCredentials } from '../../data/demo-store';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.css',
})
export class Auth {
  private readonly router = inject(Router);
  readonly store = inject(DemoStore);
  readonly demoAdmin = demoAdminCredentials;
  readonly error = signal('');
  username = '';
  password = '';

  submit() {
    if (!this.username.trim() || !this.password) {
      this.error.set('Ingresa tu usuario y contraseña.');
      return;
    }
    if (!this.store.login(this.username, this.password)) {
      this.error.set('Usuario o contraseña incorrectos, o cuenta desactivada.');
      return;
    }
    this.error.set('');
    this.password = '';
    this.router.navigateByUrl(this.store.role() === 'admin' ? '/dashboard' : '/inventario');
  }
}
