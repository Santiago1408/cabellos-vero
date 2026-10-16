import { inject, Injectable, signal } from '@angular/core';
import { ApiClient } from './api-client';

type ThemeView = { primaryColor: string };
const DEFAULT_COLOR = '#171717';

@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly api = inject(ApiClient);
  readonly primaryColor = signal(DEFAULT_COLOR);

  async load(): Promise<void> {
    try {
      const theme = await this.api.get<ThemeView>('/api/theme');
      this.apply(theme.primaryColor);
    } catch {
      // El color predeterminado permite mostrar el acceso si la API aún inicia.
    }
  }

  async save(primaryColor: string): Promise<void> {
    const theme = await this.api.write<ThemeView>('PUT', '/api/theme', { primaryColor });
    this.apply(theme.primaryColor);
  }

  private apply(primaryColor: string): void {
    if (!/^#[0-9a-f]{6}$/i.test(primaryColor)) return;
    this.primaryColor.set(primaryColor);
    const root = document.documentElement.style;
    root.setProperty('--color-primary', primaryColor);
    root.setProperty('--color-primary-hover', `color-mix(in srgb, ${primaryColor} 84%, black)`);
    root.setProperty('--color-primary-soft', `color-mix(in srgb, ${primaryColor} 8%, white)`);
  }
}
