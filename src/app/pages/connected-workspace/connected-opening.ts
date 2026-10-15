import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../data/api-client';
import { Icon } from '../../shared/icon/icon';

type Category = { code: string; displayName: string };
type Length = { centimeters: number };
type OpeningLot = {
  id: string; categoryCode: string; lengthCm: number; originalWeight: number;
  remainingWeight: number; costPerGram: number; order: number;
  originDate: string | null; costEstimated: boolean; note: string | null;
};
type OpeningView = {
  header: { id: string; cutoffAt: string; createdAt: string; version: number; actorUserId: string };
  lots: OpeningLot[];
  history: { id: number; changedAt: string; actorUserId: string; reason: string | null; oldValues: string | null; newValues: string | null }[];
  totals: { weight: number; value: number };
};
type Preview = { cutoffAt: string; lotCount: number; totalWeight: number; totalValue: number; estimatedCostLots: number };
type FormLot = {
  id: string | null; categoryCode: string; lengthCm: number | null;
  weight: string; costPerGram: string; costEstimated: boolean;
  originDate: string; note: string;
};

const emptyLot = (): FormLot => ({ id: null, categoryCode: '', lengthCm: null,
  weight: '', costPerGram: '', costEstimated: true, originDate: '', note: '' });
const boliviaLocal = (value: Date | string): string => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value)).replace(' ', 'T');

@Component({
  selector: 'app-connected-opening',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, Icon],
  templateUrl: './connected-opening.html',
  styleUrls: ['./connected-opening.css', '../../shared/operation.css'],
})
export class ConnectedOpening implements OnInit {
  private readonly api = inject(ApiClient);
  readonly close = output<void>();
  readonly saved = output<void>();
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly opening = signal<OpeningView | null>(null);
  readonly categories = signal<Category[]>([]);
  readonly lengths = signal<Length[]>([]);
  readonly editing = signal(false);
  readonly previewData = signal<Preview | null>(null);
  cutoffLocal = boliviaLocal(new Date());
  reason = '';
  lots: FormLot[] = [emptyLot()];

  ngOnInit(): void { void this.load(); }

  private async load(): Promise<void> {
    try {
      const [opening, categories, lengths] = await Promise.all([
        this.api.get<OpeningView | null>('/api/inventory/opening'),
        this.api.get<Category[]>('/api/catalog/categories'),
        this.api.get<Length[]>('/api/catalog/lengths'),
      ]);
      this.opening.set(opening);
      this.categories.set(categories);
      this.lengths.set(lengths);
      if (opening) this.fill(opening);
      else this.editing.set(true);
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.loading.set(false); }
  }

  private fill(opening: OpeningView): void {
    this.cutoffLocal = boliviaLocal(opening.header.cutoffAt);
    this.lots = opening.lots.map(lot => ({ id: lot.id, categoryCode: lot.categoryCode,
      lengthCm: lot.lengthCm, weight: lot.originalWeight.toFixed(2),
      costPerGram: lot.costPerGram.toFixed(2), costEstimated: lot.costEstimated,
      originDate: lot.originDate ?? '', note: lot.note ?? '' }));
  }

  startCorrection(): void {
    const current = this.opening();
    if (current) this.fill(current);
    this.reason = '';
    this.previewData.set(null);
    this.error.set('');
    this.editing.set(true);
  }

  cancelCorrection(): void {
    this.editing.set(false);
    this.previewData.set(null);
    this.error.set('');
  }

  changed(): void { this.previewData.set(null); }
  addLot(): void { this.lots.push(emptyLot()); this.changed(); }
  removeLot(index: number): void {
    if (this.lots.length <= 1) return;
    this.lots.splice(index, 1);
    this.changed();
  }
  move(index: number, direction: -1 | 1): void {
    const next = index + direction;
    if (next < 0 || next >= this.lots.length) return;
    [this.lots[index], this.lots[next]] = [this.lots[next], this.lots[index]];
    this.changed();
  }

  private payload(includeIds: boolean) {
    return {
      cutoffAt: `${this.cutoffLocal}:00-04:00`,
      lots: this.lots.map((lot, index) => ({
        id: includeIds ? lot.id : null, categoryCode: lot.categoryCode,
        lengthCm: lot.lengthCm, order: index + 1,
        weight: Number(lot.weight.replace(',', '.')),
        costPerGram: Number(lot.costPerGram.replace(',', '.')),
        costEstimated: lot.costEstimated, originDate: lot.originDate || null,
        note: lot.note.trim() || null,
      })),
    };
  }

  async preview(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.previewData.set(null);
    if (!this.cutoffLocal || this.lots.some(lot => !lot.categoryCode || !lot.lengthCm
      || !/^\d+(?:[.,]\d{1,2})?$/.test(lot.weight)
      || !/^\d+(?:[.,]\d{1,2})?$/.test(lot.costPerGram))) {
      this.error.set('Completa el tipo, peso y costo de cada lote con un máximo de dos decimales.');
      return;
    }
    if (this.opening() && this.reason.trim().length < 3) {
      this.error.set('Explica el motivo de la corrección (al menos 3 caracteres).');
      return;
    }
    this.busy.set(true);
    try {
      this.previewData.set(await this.api.write<Preview>('POST',
        '/api/inventory/opening/preview', this.payload(false)));
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  async save(): Promise<void> {
    if (this.busy() || !this.previewData()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const previous = this.opening();
      const body = previous
        ? { expectedVersion: previous.header.version, reason: this.reason.trim(),
            lots: this.payload(true).lots }
        : this.payload(false);
      const result = await this.api.write<OpeningView>(previous ? 'PUT' : 'POST',
        '/api/inventory/opening', body);
      this.opening.set(result);
      this.fill(result);
      this.editing.set(false);
      this.previewData.set(null);
      this.saved.emit();
    } catch (error) { this.error.set(this.message(error)); }
    finally { this.busy.set(false); }
  }

  categoryName(code: string): string {
    return this.categories().find(row => row.code === code)?.displayName ?? code;
  }

  private message(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'No se pudo conectar con la API de pruebas.';
      if (typeof error.error?.error === 'string') return error.error.error;
    }
    return 'No se pudo completar la apertura. Inténtalo nuevamente.';
  }
}
