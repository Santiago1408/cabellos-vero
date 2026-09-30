import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Debt, DemoStore, dateLabel, debtBalance, debtStatus, downloadCsv, money } from '../../data/demo-store';
import { Icon } from '../../shared/icon/icon';

const blankDebt = (): Debt => ({ id: '', party: '', phone: '', kind: 'Por cobrar', total: 0, paid: 0, date: '2026-09-22', dueDate: '', notes: '' });

@Component({selector:'app-debts',standalone:true,imports:[FormsModule,Icon],templateUrl: './debts.html',
  styleUrl: './debts.css'})
export class Debts {
  readonly store=inject(DemoStore);readonly money=money;readonly dateLabel=dateLabel;readonly balance=debtBalance;readonly status=debtStatus;
  readonly page=signal(1);readonly kindFilter=signal('');readonly statusFilter=signal('');readonly modalOpen=signal(false);readonly editingId=signal('');readonly error=signal('');
  readonly paymentOpen=signal(false);readonly selectedDebt=signal<Debt|null>(null);readonly paymentError=signal('');paymentAmount=0;draft=blankDebt();
  readonly filtered=computed(()=>this.store.debts().filter(d=>`${d.party} ${d.phone} ${d.id} ${d.notes}`.toLowerCase().includes(this.store.query().toLowerCase())&&(!this.kindFilter()||d.kind===this.kindFilter())&&(!this.statusFilter()||debtStatus(d)===this.statusFilter())));
  readonly pageCount=computed(()=>Math.max(1,Math.ceil(this.filtered().length/7)));
  readonly pageItems=computed(()=>this.filtered().slice((Math.min(this.page(),this.pageCount())-1)*7,Math.min(this.page(),this.pageCount())*7));
  readonly receivable=computed(()=>this.store.debts().filter(d=>d.kind==='Por cobrar').reduce((sum,d)=>sum+debtBalance(d),0));
  readonly payable=computed(()=>this.store.debts().filter(d=>d.kind==='Por pagar').reduce((sum,d)=>sum+debtBalance(d),0));
  readonly overdueCount=computed(()=>this.store.debts().filter(d=>debtStatus(d)==='Vencida').length);
  readonly paidCount=computed(()=>this.store.debts().filter(d=>debtStatus(d)==='Pagada').length);
  openCreate(){this.draft=blankDebt();this.editingId.set('');this.error.set('');this.modalOpen.set(true);}
  openEdit(debt:Debt){this.draft={...debt};this.editingId.set(debt.id);this.error.set('');this.modalOpen.set(true);}
  closeForm(){this.modalOpen.set(false);}
  save(){
    if(!this.draft.party.trim()||!this.draft.phone.trim()||!this.draft.date||!this.draft.dueDate){this.error.set('Completa la persona o empresa, teléfono y fechas.');return;}
    if(this.draft.total<=0){this.error.set('El monto original debe ser mayor a cero.');return;}
    if(this.draft.paid<0||this.draft.paid>this.draft.total){this.error.set('El monto pagado debe estar entre cero y el monto original.');return;}
    if(this.editingId()) this.store.updateDebt({...this.draft,id:this.editingId()});
    else this.store.addDebt({...this.draft,id:`DEU-${String(this.store.debts().length+1).padStart(3,'0')}`});
    this.page.set(1);this.closeForm();
  }
  openPayment(debt:Debt){this.selectedDebt.set(debt);this.paymentAmount=0;this.paymentError.set('');this.paymentOpen.set(true);}
  closePayment(){this.paymentOpen.set(false);this.selectedDebt.set(null);}
  applyPayment(){const debt=this.selectedDebt();if(!debt)return;const pending=debtBalance(debt);if(this.paymentAmount<=0||this.paymentAmount>pending){this.paymentError.set(`Ingresa un monto mayor a cero y no superior a ${money(pending)}.`);return;}this.store.updateDebt({...debt,paid:debt.paid+this.paymentAmount});this.closePayment();}
  export(){downloadCsv('deudas-cabellos-vero.csv',['Código','Persona o empresa','Teléfono','Tipo','Monto original Bs.','Pagado Bs.','Saldo Bs.','Fecha','Vencimiento','Estado','Notas'],this.filtered().map(d=>[d.id,d.party,d.phone,d.kind,d.total,d.paid,debtBalance(d),d.date,d.dueDate,debtStatus(d),d.notes]));}
}
