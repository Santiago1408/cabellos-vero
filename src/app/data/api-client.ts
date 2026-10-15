import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

type CsrfToken = { headerName: string; token: string };
type WriteMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Usa rutas relativas para conservar la cookie de sesión en el mismo origen. */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private csrfRequest?: Promise<CsrfToken>;

  get<T>(path: `/api/${string}`): Promise<T> {
    return firstValueFrom(this.http.get<T>(path, { withCredentials: true }));
  }

  write<T>(method: WriteMethod, path: `/api/${string}`, body?: unknown): Promise<T> {
    return this.csrf().then(async ({ headerName, token }) => {
      try {
        return await firstValueFrom(this.http.request<T>(method, path, {
          body,
          headers: new HttpHeaders().set(headerName, token),
          withCredentials: true,
        }));
      } catch (error) {
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
          this.clearCsrf();
        }
        throw error;
      }
    });
  }

  csrf(): Promise<CsrfToken> {
    if (!this.csrfRequest) {
      this.csrfRequest = this.get<CsrfToken>('/api/auth/csrf').catch(error => {
        this.csrfRequest = undefined;
        throw error;
      });
    }
    return this.csrfRequest;
  }

  clearCsrf(): void {
    this.csrfRequest = undefined;
  }
}
