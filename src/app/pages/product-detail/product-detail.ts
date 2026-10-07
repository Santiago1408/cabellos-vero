import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DemoStore, categoryLabel, dateLabel, money, weight } from '../../data/demo-store';

type Movement = {
  kind: 'purchase' | 'sale';
  id: string;
  date: string;
  party: string;
  quantity: number;
  unitPrice: number;
};

@Component({ selector: 'app-product-detail', standalone: true, imports: [RouterLink], templateUrl: './product-detail.html',
  styleUrl: './product-detail.css' })
export class ProductDetail {
  readonly store = inject(DemoStore);
  private readonly route = inject(ActivatedRoute);
  readonly weight = weight;
  readonly money = money;
  readonly dateLabel = dateLabel;
  readonly categoryLabel = categoryLabel;
  readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly product = computed(() => this.store.products().find(product => product.id === this.params().get('id')));
  readonly movements = computed<Movement[]>(() => {
    const productId = this.product()?.id;
    if (!productId) return [];
    return [
      ...this.store.orders().filter(order => order.status === 'Confirmado')
        .flatMap(order => order.items.filter(item => item.productId === productId)
          .map(item => ({ kind: 'purchase' as const, id: order.id, date: order.date,
            party: order.supplier, quantity: item.quantity, unitPrice: item.unitPrice }))),
      ...this.store.sales().filter(sale => sale.status === 'Confirmado')
        .flatMap(sale => sale.items.filter(item => item.productId === productId)
          .map(item => ({ kind: 'sale' as const, id: sale.id, date: sale.date,
            party: sale.customer, quantity: item.quantity, unitPrice: item.unitPrice }))),
    ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  });
  readonly purchasedWeight = computed(() => this.movements()
    .filter(movement => movement.kind === 'purchase')
    .reduce((sum, movement) => sum + movement.quantity, 0));
  readonly soldWeight = computed(() => this.movements()
    .filter(movement => movement.kind === 'sale')
    .reduce((sum, movement) => sum + movement.quantity, 0));
  readonly openingLot = computed(() => this.store.initialLots.find(lot => lot.productId === this.product()?.id));
  readonly openingWeight = computed(() => this.openingLot()?.quantity ?? 0);
}
