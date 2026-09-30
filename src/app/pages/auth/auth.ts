import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DemoStore } from '../../data/demo-store';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './auth.html',
  styleUrl: './auth.css'
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
