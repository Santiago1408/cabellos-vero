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

  /** Descarga archivos generados por el servidor con la misma protección CSRF. */
  download(path: `/api/${string}`): Promise<{ blob: Blob; fileName: string }> {
    return this.csrf().then(async ({ headerName, token }) => {
      try {
        const response = await firstValueFrom(this.http.request('POST', path, {
          headers: new HttpHeaders().set(headerName, token),
          withCredentials: true, observe: 'response', responseType: 'blob',
        }));
        const header = response.headers.get('Content-Disposition') ?? '';
        const match = /filename="?([^";]+)"?/.exec(header);
        return { blob: response.body ?? new Blob(), fileName: match?.[1] ?? 'respaldo.csv' };
      } catch (error) {
        if (error instanceof HttpErrorResponse) {
          if (error.status === 401 || error.status === 403) this.clearCsrf();
          if (error.error instanceof Blob) {
            try {
              const parsed = JSON.parse(await error.error.text());
              throw new HttpErrorResponse({ error: parsed, status: error.status, statusText: error.statusText, url: error.url ?? undefined });
            } catch (parsedError) {
              if (parsedError instanceof HttpErrorResponse) throw parsedError;
            }
          }
        }
        throw error;
      }
    });
  }

  /** El navegador define el multipart boundary; solo agregamos CSRF y la cookie. */
  upload<T>(path: `/api/${string}`, file: File, fields: Record<string, string> = {}): Promise<T> {
    const body = new FormData();
    body.append('file', file);
    for (const [name, value] of Object.entries(fields)) body.append(name, value);
    return this.csrf().then(async ({ headerName, token }) => {
      try {
        return await firstValueFrom(this.http.post<T>(path, body, {
          headers: new HttpHeaders().set(headerName, token), withCredentials: true,
        }));
      } catch (error) {
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) this.clearCsrf();
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
