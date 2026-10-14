import { Component, Input } from '@angular/core';
import { OperationChange, categoryLabel, dateLabel, lineValue, modifiedLabel, money, operationValue, unitPriceLabel, weight } from '../../data/demo-store';

@Component({
  selector: 'app-operation-history',
  standalone: true,
  templateUrl: './operation-history.html',
  styleUrl: './operation-history.css',
})
export class OperationHistory {
  @Input() changes: OperationChange[] = [];
  @Input() partyLabel = 'Persona';
  @Input() effectiveDateLabel = 'Fecha efectiva';

  readonly categoryLabel = categoryLabel;
  readonly dateLabel = dateLabel;
  readonly modifiedLabel = modifiedLabel;
  readonly money = money;
  readonly lineValue = lineValue;
  readonly unitPriceLabel = unitPriceLabel;
  readonly operationValue = operationValue;
  readonly weight = weight;

  get recentChanges() { return [...this.changes].reverse(); }
}
