import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DemoStore, categoryLabel, dateLabel, eventLineValue, lineValue, money, operationEvents, unitPriceLabel, weight } from '../../data/demo-store';

type Movement = {
  kind: 'purchase' | 'sale';
  id: string;
  eventId: string;
  at: string;
  date: string;
  party: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

@Component({ selector: 'app-product-detail', standalone: true, imports: [RouterLink], templateUrl: './product-detail.html',
  styleUrl: './product-detail.css' })
export class ProductDetail {
  readonly store = inject(DemoStore);
  private readonly route = inject(ActivatedRoute);
  readonly weight = weight;
  readonly money = money;
  readonly lineValue = lineValue;
  readonly unitPriceLabel = unitPriceLabel;
  readonly dateLabel = dateLabel;
  readonly categoryLabel = categoryLabel;
  readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  readonly product = computed(() => this.store.products().find(product => product.id === this.params().get('id')));
  readonly movements = computed<Movement[]>(() => {
    const productId = this.product()?.id;
    if (!productId) return [];
    return [
      ...this.store.orders().flatMap(order => operationEvents(order).flatMap(event => event.items
        .filter(part => part.productId === productId).map(part => ({ kind: 'purchase' as const,
          id: order.id, eventId: event.id, at: event.at, date: event.at.slice(0, 10), party: order.supplier, quantity: part.quantity,
          unitPrice: order.items.find(item => item.productId === part.productId)?.unitPrice ?? 0,
          amount: eventLineValue(order, event, part.productId) })))),
      ...this.store.sales().flatMap(sale => operationEvents(sale).flatMap(event => event.items
        .filter(part => part.productId === productId).map(part => ({ kind: 'sale' as const,
          id: sale.id, eventId: event.id, at: event.at, date: event.at.slice(0, 10), party: sale.customer, quantity: part.quantity,
          unitPrice: sale.items.find(item => item.productId === part.productId)?.unitPrice ?? 0,
          amount: eventLineValue(sale, event, part.productId) })))),
    ].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  });
  readonly purchasedWeight = computed(() => this.movements()
    .filter(movement => movement.kind === 'purchase')
    .reduce((sum, movement) => sum + movement.quantity, 0));
  readonly soldWeight = computed(() => this.movements()
    .filter(movement => movement.kind === 'sale')
    .reduce((sum, movement) => sum + movement.quantity, 0));
  readonly openingLot = computed(() => this.store.initialLots.find(lot => lot.productId === this.product()?.id));
  readonly openingWeight = computed(() => this.openingLot()?.quantity ?? 0);
  readonly pendingWeight = computed(() => this.product() ? this.store.pendingPurchaseWeight(this.product()!.id) : 0);
  readonly reservedWeight = computed(() => this.product() ? this.store.pendingSaleWeight(this.product()!.id) : 0);
  readonly immediateWeight = computed(() => this.product() ? this.store.sellableWeight(this.product()!.id) : 0);
  readonly additionalReserveWeight = computed(() => this.product() ? this.store.reservableWeight(this.product()!.id) - this.immediateWeight() : 0);
}
