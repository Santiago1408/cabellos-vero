import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DemoStore } from '../data/demo-store';
import { Icon } from './icon';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, Icon],
  template: `
  <div class="app-frame min-w-0">
    @if (mobileOpen()) { <button class="mobile-scrim" aria-label="Cerrar menú" (click)="mobileOpen.set(false)"></button> }
    <aside class="sidebar flex flex-col" [class.sidebar-open]="mobileOpen()">
      <a class="brand" routerLink="/dashboard" (click)="mobileOpen.set(false)">
        <span class="brand-mark">CV<span class="brand-mark-dot"></span></span><span>Cabellos <strong>Vero</strong></span>
      </a>
      <div class="sidebar-caption">MENÚ PRINCIPAL</div>
      <nav class="nav-list flex flex-col" aria-label="Navegación principal">
        <a routerLink="/dashboard" routerLinkActive="active" (click)="mobileOpen.set(false)"><app-icon name="home"/> <span>Inicio</span></a>
        <a routerLink="/inventario" routerLinkActive="active" (click)="mobileOpen.set(false)"><app-icon name="box"/> <span>Inventario</span></a>
        <a routerLink="/reportes" routerLinkActive="active" (click)="mobileOpen.set(false)"><app-icon name="chart"/> <span>Reportes</span></a>
        <a routerLink="/proveedores" routerLinkActive="active" (click)="mobileOpen.set(false)"><app-icon name="users"/> <span>Proveedores</span></a>
        <a routerLink="/pedidos" routerLinkActive="active" (click)="mobileOpen.set(false)"><app-icon name="truck"/> <span>Pedidos</span></a>
        <a routerLink="/tienda" routerLinkActive="active" (click)="mobileOpen.set(false)"><app-icon name="store"/> <span>Mi tienda</span></a>
      </nav>
      <div class="sidebar-bottom">
        <a routerLink="/configuracion" routerLinkActive="active" (click)="mobileOpen.set(false)"><app-icon name="settings"/> <span>Configuración</span></a>
        <a routerLink="/ingresar" (click)="mobileOpen.set(false)"><app-icon name="logout"/> <span>Cerrar sesión</span></a>
      </div>
    </aside>
    <div class="main-wrap min-w-0">
      <header class="topbar flex items-center">
        <button class="icon-button mobile-menu" aria-label="Abrir menú" (click)="mobileOpen.set(true)"><app-icon name="menu"/></button>
        <label class="search-box"><app-icon name="search"/><input type="search" placeholder="Buscar productos, proveedores o pedidos" [ngModel]="store.query()" (ngModelChange)="store.query.set($event)" aria-label="Buscar" class="min-w-0" /></label>
        <div class="topbar-right">
          <span class="demo-badge">DEMO</span>
          <button class="icon-button notification-button" aria-label="Notificaciones" (click)="notifications.set(!notifications())"><app-icon name="bell"/><span class="notification-dot"></span></button>
          <button class="profile-button" (click)="profileOpen.set(!profileOpen())" aria-label="Opciones del perfil"><span class="avatar">{{ initials }}</span><span class="profile-copy"><strong>{{ store.displayName() }}</strong><small>{{ store.role() === 'admin' ? 'Administrador' : 'Usuario' }}</small></span><span class="profile-caret">⌄</span></button>
        </div>
        @if (notifications()) { <div class="top-popover notice-popover"><strong>Notificaciones</strong><p>Tienes {{ lowStockCount }} productos con stock bajo o agotados.</p><a routerLink="/inventario" (click)="notifications.set(false)">Ver inventario <app-icon name="arrow"/></a></div> }
        @if (profileOpen()) { <div class="top-popover profile-popover"><strong>{{ store.displayName() }}</strong><p>Rol de demostración</p><button (click)="setRole('admin')">Administrador</button><button (click)="setRole('user')">Usuario</button><a routerLink="/ingresar" (click)="profileOpen.set(false)">Cerrar sesión</a></div> }
      </header>
      <main class="page-content"><router-outlet /></main>
    </div>
  </div>`,
})
export class Shell {
  readonly store = inject(DemoStore);
  readonly mobileOpen = signal(false);
  readonly notifications = signal(false);
  readonly profileOpen = signal(false);
  get initials() { return this.store.displayName().split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase(); }
  get lowStockCount() { return this.store.products().filter(p => p.quantity <= p.threshold).length; }
  setRole(role: 'admin' | 'user') { this.store.role.set(role); this.profileOpen.set(false); }
}
