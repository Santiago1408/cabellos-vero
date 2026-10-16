import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { ApiClient } from './api-client';

export type Account = {
  id: string;
  username: string;
  displayName: string;
  role: 'ADMIN' | 'EMPLOYEE';
  ci: string | null;
  birthDate: string | null;
  phone: string | null;
  mustChangePassword: boolean;
};

@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly api = inject(ApiClient);
  readonly account = signal<Account | null>(null);

  /** Consulta la cookie persistente al iniciar la futura aplicación conectada. */
  async restore(): Promise<Account | null> {
    try {
      const account = await this.api.get<Account>('/api/auth/me');
      this.account.set(account);
      return account;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.account.set(null);
        this.api.clearCsrf();
        return null;
      }
      throw error;
    }
  }

  async login(username: string, password: string): Promise<Account> {
    const account = await this.api.write<Account>('POST', '/api/auth/login', { username, password });
    this.account.set(account);
    // Spring cambia el identificador de sesión y descarta el token anterior al ingresar.
    this.api.clearCsrf();
    await this.api.csrf();
    return account;
  }

  async logout(): Promise<void> {
    try {
      await this.api.write<void>('POST', '/api/auth/logout');
    } catch (error) {
      // Una sesión ya vencida equivale a haber salido. Los demás errores no
      // permiten asumir que el servidor haya invalidado la cookie.
      if (!(error instanceof HttpErrorResponse && error.status === 401)) throw error;
    }
    this.account.set(null);
    this.api.clearCsrf();
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.api.write<void>('POST', '/api/auth/password', { currentPassword, newPassword });
    await this.restore();
  }

  async changeDisplayName(fullName: string): Promise<Account> {
    const account = await this.api.write<Account>('PUT', '/api/auth/profile', { fullName });
    this.account.set(account);
    return account;
  }
}
