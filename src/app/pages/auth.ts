import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DemoStore } from '../data/demo-store';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `<div class="auth-layout grid min-h-screen">
    <section class="auth-brand-panel"><div class="auth-brand-inner"><div class="auth-monogram">CV<span></span></div><h1>Cabellos Vero</h1><p>Todo lo que necesitas para llevar el control de tu negocio, en un solo lugar.</p><div class="auth-brand-footer">GESTIÓN SIMPLE · CONTROL TOTAL</div></div></section>
    <section class="auth-form-panel"><div class="auth-card"><div class="auth-mobile-brand"><span class="brand-mark">CV</span> Cabellos Vero</div>
      <div class="eyebrow">BIENVENIDO A CABELLOS VERO</div><h2>{{ signup ? 'Crear cuenta' : 'Inicia sesión' }}</h2><p class="auth-intro">{{ signup ? 'Registra un usuario para comenzar a explorar el sistema.' : 'Ingresa para acceder a tu espacio de trabajo.' }}</p>
      <form (ngSubmit)="submit()">
        @if (signup) { <label class="field-label">Nombre completo<input class="field-input" name="name" [(ngModel)]="name" placeholder="Tu nombre completo" required /></label> }
        <label class="field-label">Correo electrónico<input class="field-input" type="email" name="email" [(ngModel)]="email" placeholder="nombre@ejemplo.com" required /></label>
        <label class="field-label">Contraseña<input class="field-input" type="password" name="password" [(ngModel)]="password" placeholder="Mínimo 8 caracteres" minlength="8" required /></label>
        @if (!signup) { <div class="auth-options"><label><input type="checkbox" /> Recordarme</label><a href="#" (click)="$event.preventDefault(); showHint.set(true)">¿Olvidaste tu contraseña?</a></div> }
        @if (showHint()) { <p class="inline-hint">En esta demostración puedes ingresar cualquier correo y contraseña de al menos 8 caracteres.</p> }
        <button class="btn btn-primary auth-submit" type="submit">{{ signup ? 'Crear cuenta' : 'Ingresar' }}</button>
      </form>
      <div class="demo-divider">ACCESO RÁPIDO A LA DEMOSTRACIÓN</div>
      <div class="demo-login-buttons"><button class="btn btn-outline" (click)="enter('admin')">Entrar como admin</button><button class="btn btn-outline" (click)="enter('user')">Entrar como usuario</button></div>
      <p class="auth-switch">{{ signup ? '¿Ya tienes una cuenta?' : '¿Aún no tienes una cuenta?' }} <a [routerLink]="signup ? '/ingresar' : '/registro'">{{ signup ? 'Inicia sesión' : 'Crear cuenta' }}</a></p>
    </div></section>
  </div>`
})
export class Auth {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(DemoStore);
  readonly showHint = signal(false);
  name = '';
  email = '';
  password = '';
  signup = false;
  constructor() { this.signup = this.route.snapshot.routeConfig?.path === 'registro'; }
  submit() { if (this.password.length < 8 || !this.email.includes('@')) return; this.store.displayName.set(this.name || this.email.split('@')[0]); this.enter('admin'); }
  enter(role: 'admin' | 'user') { this.store.role.set(role); this.router.navigateByUrl('/dashboard'); }
}
