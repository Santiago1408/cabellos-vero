import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DemoStore, categoryLabel, dateLabel, money, weight } from '../../data/demo-store';

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
  readonly purchases = computed(() => this.store.orders()
    .filter(order => order.status === 'Confirmado')
    .flatMap(order => order.items.filter(item => item.productId === this.product()?.id).map(item => ({ order, item })))
    .sort((a, b) => b.order.date.localeCompare(a.order.date) || b.order.id.localeCompare(a.order.id)));
  readonly purchasedWeight = computed(() => this.purchases().reduce((sum, entry) => sum + entry.item.quantity, 0));
  readonly soldWeight = computed(() => this.store.sales()
    .filter(sale => sale.status === 'Confirmado')
    .flatMap(sale => sale.items.filter(item => item.productId === this.product()?.id))
    .reduce((sum, item) => sum + item.quantity, 0));
  readonly openingWeight = computed(() => (this.product()?.quantity ?? 0) - this.purchasedWeight() + this.soldWeight());
}
