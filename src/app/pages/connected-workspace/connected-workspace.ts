import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../data/api-client';
import { AuthSession } from '../../data/auth-session';

type Category = { code: string; displayName: string };
type Length = { centimeters: number };
type StockRow = {
  categoryCode: string;
  categoryName: string;
  lengthCm: number;
  physicalStock: number;
  pendingPurchase: number;
  reservedSale: number;
  freePhysical: number;
};

@Component({
  selector: 'app-connected-workspace',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './connected-workspace.html',
  styleUrl: './connected-workspace.css',
})
export class ConnectedWorkspace implements OnInit {
  readonly session = inject(AuthSession);
  private readonly api = inject(ApiClient);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly dataLoaded = signal(false);
  readonly categories = signal<Category[]>([]);
  readonly lengths = signal<Length[]>([]);
  readonly stock = signal<StockRow[]>([]);
  username = '';
  password = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  ngOnInit(): void {
    void this.restore();
  }

  private async restore(): Promise<void> {
    try {
      const account = await this.session.restore();
      if (account && !account.mustChangePassword) await this.loadData();
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async login(): Promise<void> {
    if (this.busy()) return;
    if (!this.username.trim() || !this.password) {
      this.error.set('Ingresa tu usuario y contraseña.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const account = await this.session.login(this.username.trim(), this.password);
      if (!account.mustChangePassword) await this.loadData();
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.password = '';
      this.busy.set(false);
    }
  }

  async changePassword(): Promise<void> {
    if (this.busy()) return;
    if (this.newPassword.length < 8) {
      this.error.set('La nueva contraseña debe tener al menos ocho caracteres.');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error.set('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      await this.session.changePassword(this.currentPassword, this.newPassword);
      await this.loadData();
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  async logout(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.session.logout();
      this.categories.set([]);
      this.lengths.set([]);
      this.stock.set([]);
      this.dataLoaded.set(false);
      this.username = '';
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  async refresh(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.loadData();
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async loadData(): Promise<void> {
    try {
      const [categories, lengths, stock] = await Promise.all([
        this.api.get<Category[]>('/api/catalog/categories'),
        this.api.get<Length[]>('/api/catalog/lengths'),
        this.api.get<StockRow[]>('/api/inventory'),
      ]);
      this.categories.set(categories);
      this.lengths.set(lengths);
      this.stock.set(stock);
      this.dataLoaded.set(true);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        await this.session.restore();
        this.dataLoaded.set(false);
      }
      throw error;
    }
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'No se pudo completar la solicitud. Inténtalo nuevamente.';
    if (error.status === 0) return 'No se pudo conectar con la API. Comprueba que Spring Boot esté funcionando.';
    if (error.status === 401) return 'Usuario o contraseña incorrectos, o la sesión ha vencido.';
    if (error.status === 429) return 'Hubo varios intentos fallidos. Espera unos minutos antes de volver a ingresar.';
    if (error.status === 403) return 'La operación fue rechazada. Recarga la página e inténtalo nuevamente.';
    const message = error.error?.error;
    return typeof message === 'string' ? message : 'El servidor no pudo completar la solicitud.';
  }
}
