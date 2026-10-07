import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Debt, DemoStore, dateLabel, debtBalance, debtStatus, downloadCsv, money, todayLocal } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

type SortKey = 'party' | 'kind' | 'total' | 'paid' | 'balance' | 'dueDate' | 'status';
const statusUrgency = { Vencida: 0, Pendiente: 1, Parcial: 2, Pagada: 3 };
const blankDebt = (): Debt => ({ id: '', party: '', phone: '', kind: 'Por cobrar', total: 0, paid: 0, date: todayLocal(), dueDate: '', notes: '' });

@Component({selector:'app-debts',standalone:true,imports:[FormsModule,Icon],templateUrl: './debts.html',
  styleUrls: ['./debts.css', '../../shared/operation.css']})
export class Debts {
  readonly store=inject(DemoStore);readonly money=money;readonly dateLabel=dateLabel;readonly balance=debtBalance;readonly status=debtStatus;
  readonly page=signal(1);readonly kindFilter=signal('');readonly statusFilter=signal('');readonly modalOpen=signal(false);readonly editingId=signal('');readonly error=signal('');
  readonly detailId=signal<string|null>(null);
  readonly detail=computed(()=>this.store.debts().find(debt=>debt.id===this.detailId()));
  readonly paymentOpen=signal(false);readonly selectedDebt=signal<Debt|null>(null);readonly paymentError=signal('');paymentAmount=0;draft=blankDebt();
  readonly sortKey = signal<SortKey>('party');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');
  readonly filtered=computed(()=>this.store.debts().filter(d=>`${d.party} ${d.phone} ${d.id} ${d.notes}`.toLowerCase().includes(this.store.query().toLowerCase())&&(!this.kindFilter()||d.kind===this.kindFilter())&&(!this.statusFilter()||debtStatus(d)===this.statusFilter())));
  readonly sorted = computed(() => {
    const key = this.sortKey();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    const value = (debt: Debt): string | number => {
      switch (key) {
        case 'party': return debt.party;
        case 'kind': return debt.kind;
        case 'total': return debt.total;
        case 'paid': return debt.paid;
        case 'balance': return debtBalance(debt);
        case 'dueDate': return debt.dueDate;
        case 'status': return statusUrgency[debtStatus(debt)];
      }
    };
    return [...this.filtered()].sort((left, right) => {
      const a = value(left); const b = value(right);
      const comparison = typeof a === 'number' && typeof b === 'number'
        ? a - b : String(a).localeCompare(String(b), 'es-BO', { sensitivity: 'base' });
      return direction * comparison || left.party.localeCompare(right.party, 'es-BO') || left.id.localeCompare(right.id);
    });
  });
  readonly pageCount=computed(()=>Math.max(1,Math.ceil(this.filtered().length/7)));
  readonly pageItems=computed(()=>this.sorted().slice((Math.min(this.page(),this.pageCount())-1)*7,Math.min(this.page(),this.pageCount())*7));
  readonly receivable=computed(()=>this.store.debts().filter(d=>d.kind==='Por cobrar').reduce((sum,d)=>sum+debtBalance(d),0));
  readonly payable=computed(()=>this.store.debts().filter(d=>d.kind==='Por pagar').reduce((sum,d)=>sum+debtBalance(d),0));
  readonly overdueCount=computed(()=>this.store.debts().filter(d=>debtStatus(d)==='Vencida').length);
  readonly paidCount=computed(()=>this.store.debts().filter(d=>debtStatus(d)==='Pagada').length);
  sortBy(key: SortKey) {
    if (this.sortKey() === key) this.sortDirection.update(direction => direction === 'asc' ? 'desc' : 'asc');
    else { this.sortKey.set(key); this.sortDirection.set('asc'); }
    this.page.set(1);
  }
  setMobileSort(value: string) {
    const [key, direction] = value.split(':') as [SortKey, 'asc' | 'desc'];
    this.sortKey.set(key); this.sortDirection.set(direction); this.page.set(1);
  }
  sortAria(key: SortKey) { return this.sortKey() === key ? this.sortDirection() === 'asc' ? 'ascending' : 'descending' : 'none'; }
  sortIndicator(key: SortKey) { return this.sortKey() === key ? this.sortDirection() === 'asc' ? '↑' : '↓' : '↕'; }
  openCreate(){this.draft=blankDebt();this.editingId.set('');this.error.set('');this.modalOpen.set(true);}
  openEdit(debt:Debt){this.detailId.set(null);this.draft={...debt};this.editingId.set(debt.id);this.error.set('');this.modalOpen.set(true);}
  closeForm(){this.modalOpen.set(false);}
  save(){
    if(!this.draft.party.trim()||!this.draft.phone.trim()||!this.draft.date||!this.draft.dueDate){this.error.set('Completa la persona o empresa, teléfono y fechas.');return;}
    if(this.draft.total<=0){this.error.set('El monto original debe ser mayor a cero.');return;}
    if(this.draft.paid<0||this.draft.paid>this.draft.total){this.error.set('El monto pagado debe estar entre cero y el monto original.');return;}
    if(this.editingId()) this.store.updateDebt({...this.draft,id:this.editingId()});
    else this.store.addDebt({...this.draft,id:`DEU-${String(this.store.debts().length+1).padStart(3,'0')}`});
    this.page.set(1);this.closeForm();
  }
  openPayment(debt:Debt){this.detailId.set(null);this.selectedDebt.set(debt);this.paymentAmount=0;this.paymentError.set('');this.paymentOpen.set(true);}
  closePayment(){this.paymentOpen.set(false);this.selectedDebt.set(null);}
  applyPayment(){const debt=this.selectedDebt();if(!debt)return;const pending=debtBalance(debt);if(this.paymentAmount<=0||this.paymentAmount>pending){this.paymentError.set(`Ingresa un monto mayor a cero y no superior a ${money(pending)}.`);return;}this.store.updateDebt({...debt,paid:debt.paid+this.paymentAmount});this.closePayment();}
  export(){downloadCsv('deudas-cabellos-vero.csv',['Código','Persona o empresa','Teléfono','Tipo','Monto original Bs.','Pagado Bs.','Saldo Bs.','Fecha','Vencimiento','Estado','Notas'],this.sorted().map(d=>[d.id,d.party,d.phone,d.kind,d.total,d.paid,debtBalance(d),d.date,d.dueDate,debtStatus(d),d.notes]));}
}
