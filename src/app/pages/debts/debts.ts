import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Debt, DebtChange, DebtPayment, DemoStore, dateLabel, debtBalance, debtPaid, debtStatus, downloadCsv, modifiedLabel, money, todayLocal } from '../../data/demo-store';
import { hasTwoDecimalPlaces, sumMoney } from '../../data/money';
import { Icon } from '../../shared/icon/icon';

type SortKey = 'party' | 'kind' | 'total' | 'paid' | 'balance' | 'dueDate' | 'status';
const statusUrgency = { Vencida: 0, Pendiente: 1, Parcial: 2, Pagada: 3 };
const blankDebt = (): Debt => ({ id: '', party: '', phone: '', kind: 'Por cobrar', total: 0, payments: [], date: todayLocal(), dueDate: '', notes: '' });

@Component({selector:'app-debts',standalone:true,imports:[FormsModule,Icon],templateUrl: './debts.html',
  styleUrls: ['./debts.css', './debt-history.css', '../../shared/operation.css']})
export class Debts {
  readonly store=inject(DemoStore);readonly money=money;readonly dateLabel=dateLabel;readonly modifiedLabel=modifiedLabel;readonly balance=debtBalance;readonly paid=debtPaid;readonly status=debtStatus;readonly today=todayLocal();
  readonly page=signal(1);readonly kindFilter=signal('');readonly statusFilter=signal('');readonly modalOpen=signal(false);readonly editingId=signal('');readonly error=signal('');
  readonly detailId=signal<string|null>(null);
  readonly detail=computed(()=>this.store.debts().find(debt=>debt.id===this.detailId()));
  readonly paymentHistory=computed(()=>[...(this.detail()?.payments??[])].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)));
  readonly debtChangeHistory=computed(()=>[...(this.detail()?.changeHistory??[])].reverse());
  readonly voidPromptId=signal<string|null>(null);
  readonly paymentActionError=signal('');
  readonly paymentOpen=signal(false);readonly selectedDebt=signal<Debt|null>(null);readonly paymentError=signal('');paymentAmount=0;paymentDate=todayLocal();paymentNote='';draft=blankDebt();
  readonly editingPaymentId=signal<string|null>(null);
  readonly editingPayment=computed(()=>this.selectedDebt()?.payments.find(payment=>payment.id===this.editingPaymentId()));
  readonly paymentReturnToDetail=signal(false);
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
        case 'paid': return debtPaid(debt);
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
  debtChangeRows(change: DebtChange) {
    const before = change.before;
    const after = change.after;
    return [
      { label: 'Persona o empresa', before: before.party, after: after.party, changed: before.party !== after.party },
      { label: 'Teléfono', before: before.phone, after: after.phone, changed: before.phone !== after.phone },
      { label: 'Tipo', before: before.kind, after: after.kind, changed: before.kind !== after.kind },
      { label: 'Monto original', before: money(before.total), after: money(after.total), changed: before.total !== after.total },
      { label: 'Fecha de registro', before: dateLabel(before.date), after: dateLabel(after.date), changed: before.date !== after.date },
      { label: 'Vencimiento', before: dateLabel(before.dueDate), after: dateLabel(after.dueDate), changed: before.dueDate !== after.dueDate },
      { label: 'Notas', before: before.notes || '—', after: after.notes || '—', changed: before.notes !== after.notes },
    ].filter(row => row.changed);
  }
  openDetail(id:string){this.paymentActionError.set('');this.voidPromptId.set(null);this.detailId.set(id);}
  closeDetail(){this.detailId.set(null);this.voidPromptId.set(null);}
  openCreate(){this.draft=blankDebt();this.editingId.set('');this.error.set('');this.modalOpen.set(true);}
  openEdit(debt:Debt){this.detailId.set(null);this.draft={...debt,payments:[...debt.payments]};this.editingId.set(debt.id);this.error.set('');this.modalOpen.set(true);}
  closeForm(){this.modalOpen.set(false);}
  save(){
    if(!this.draft.party.trim()||!this.draft.phone.trim()||!this.draft.date||!this.draft.dueDate){this.error.set('Completa la persona o empresa, teléfono y fechas.');return;}
    if(!Number.isFinite(this.draft.total)||this.draft.total<=0){this.error.set('El monto original debe ser mayor a cero.');return;}
    if(!hasTwoDecimalPlaces(this.draft.total)){this.error.set('El monto original admite como máximo dos decimales.');return;}
    if(debtPaid(this.draft)>this.draft.total){this.error.set('El monto original no puede ser menor que los pagos ya registrados.');return;}
    if(this.draft.payments.some(payment=>payment.date<this.draft.date)){this.error.set('La fecha de registro no puede ser posterior a un abono registrado, incluso si fue anulado.');return;}
    if(this.editingId()) this.store.updateDebt({...this.draft,id:this.editingId()});
    else {
      const id=`DEU-${String(this.store.debts().length+1).padStart(3,'0')}`;
      this.store.addDebt({...this.draft,id});
      this.detailId.set(id);
    }
    this.page.set(1);this.closeForm();
  }
  openPayment(debt:Debt, fromDetail=false){
    this.detailId.set(null);this.selectedDebt.set(debt);this.editingPaymentId.set(null);this.paymentReturnToDetail.set(fromDetail);
    this.paymentAmount=0;this.paymentDate=todayLocal();this.paymentNote='';this.paymentError.set('');this.paymentOpen.set(true);
  }
  openEditPayment(debt:Debt,payment:DebtPayment){
    if(payment.voidedAt)return;
    this.detailId.set(null);this.selectedDebt.set(debt);this.editingPaymentId.set(payment.id);this.paymentReturnToDetail.set(true);
    this.paymentAmount=payment.amount;this.paymentDate=payment.date;this.paymentNote=payment.note;this.paymentError.set('');this.paymentOpen.set(true);
  }
  closePayment(reopen=this.paymentReturnToDetail()){
    const debtId=this.selectedDebt()?.id;
    this.paymentOpen.set(false);this.selectedDebt.set(null);this.editingPaymentId.set(null);this.paymentReturnToDetail.set(false);
    if(reopen&&debtId)this.openDetail(debtId);
  }
  paymentMaximum(debt:Debt){return sumMoney([debtBalance(debt),this.editingPayment()?.amount??0]);}
  applyPayment(){
    const debt=this.selectedDebt();if(!debt)return;
    const editingId=this.editingPaymentId();
    const message=editingId
      ? this.store.updateDebtPayment(debt.id,editingId,this.paymentDate,Number(this.paymentAmount),this.paymentNote)
      : this.store.addDebtPayment(debt.id,this.paymentDate,Number(this.paymentAmount),this.paymentNote);
    if(message){this.paymentError.set(message);return;}
    this.closePayment(true);
  }
  voidPayment(debtId:string,paymentId:string){
    const message=this.store.voidDebtPayment(debtId,paymentId);
    this.paymentActionError.set(message);
    if(!message)this.voidPromptId.set(null);
  }
  export(){downloadCsv('deudas-efectivo.csv',['Código','Persona o empresa','Teléfono','Tipo','Monto original Bs.','Pagado Bs.','Saldo Bs.','Abonos vigentes','Abonos anulados','Fecha','Vencimiento','Estado','Notas','Abonos e historial JSON','Historial de deuda JSON'],this.store.debts().map(d=>[d.id,d.party,d.phone,d.kind,d.total,debtPaid(d),debtBalance(d),d.payments.filter(payment=>!payment.voidedAt).length,d.payments.filter(payment=>!!payment.voidedAt).length,d.date,d.dueDate,debtStatus(d),d.notes,JSON.stringify(d.payments),JSON.stringify(d.changeHistory??[])]));}
}
