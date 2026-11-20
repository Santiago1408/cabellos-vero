import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ConnectedWorkspace } from './connected-workspace';
import { AuthSession } from '../../data/auth-session';
import { ApiClient } from '../../data/api-client';
import { Theme } from '../../data/theme';

describe('acceso por rol', () => {
  it('inicia en compras sin consultar inventario y rechaza navegación a módulos restringidos', async () => {
    const account = { role: 'EMPLOYEE', mustChangePassword: false };
    const api = { get: vi.fn().mockResolvedValue([]) };
    TestBed.configureTestingModule({providers: [
      {provide: ApiClient, useValue: api},
      {provide: AuthSession, useValue: { account: signal(account), login: vi.fn().mockResolvedValue(account) }},
      {provide: Theme, useValue: {}},
    ]});
    const workspace = TestBed.runInInjectionContext(() => new ConnectedWorkspace());
    workspace.username = 'empleado'; workspace.password = '1234';
    await workspace.login();
    expect(workspace.section()).toBe('purchases');
    expect(api.get.mock.calls.some(([path]) => path.startsWith('/api/inventory'))).toBe(false);
    workspace.selectSection('inventory');
    expect(workspace.section()).toBe('purchases');
    workspace.selectSection('reports');
    expect(workspace.section()).toBe('purchases');
    workspace.selectSection('branches');
    expect(workspace.section()).toBe('purchases');
    workspace.selectSection('sales');
    expect(workspace.section()).toBe('sales');
    TestBed.resetTestingModule();
  });
  it('envía al dueño a su sucursal sin consultar datos de la tienda principal', async () => {
    const account = { role: 'BRANCH_OWNER', mustChangePassword: false };
    const api = { get: vi.fn().mockResolvedValue([]) };
    TestBed.configureTestingModule({providers: [
      {provide: ApiClient, useValue: api},
      {provide: AuthSession, useValue: {account: signal(account), login: vi.fn().mockResolvedValue(account)}},
      {provide: Theme, useValue: {}},
    ]});
    const workspace = TestBed.runInInjectionContext(() => new ConnectedWorkspace());
    workspace.username = 'dueno'; workspace.password = '1'; await workspace.login();
    expect(workspace.section()).toBe('branches'); expect(api.get).not.toHaveBeenCalled();
    for (const section of ['purchases','sales','reports','inventory','employees'] as const) {
      workspace.selectSection(section); expect(workspace.section()).toBe('branches');
    }
    workspace.selectSection('settings'); expect(workspace.section()).toBe('settings');
    TestBed.resetTestingModule();
  });
});
