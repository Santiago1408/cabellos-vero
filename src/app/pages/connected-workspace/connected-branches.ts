import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClient } from '../../data/api-client';
import { AuthSession } from '../../data/auth-session';
import { BranchDetail, BranchLot, BranchOverview, BranchOwner, BranchReport } from '../../data/branch-api';
import { AuditHistory } from '../../shared/audit-history/audit-history';

type FormKind = 'branch' | 'assign' | 'owner' | 'password' | 'delete-owner' | 'purchase' | 'sale' | 'mix' | 'cash' | 'reverse';
type Part = {lotId: string; weight: number | null};
@Component({
 selector: 'app-connected-branches', standalone: true, imports: [FormsModule, DatePipe, DecimalPipe, AuditHistory],
 templateUrl: './connected-branches.html', styleUrls: ['./connected-branches.css', '../../shared/operation.css'],
})
export class ConnectedBranches implements OnInit {
 readonly api=inject(ApiClient); readonly session=inject(AuthSession);
 readonly admin=computed(()=>this.session.account()?.role==='ADMIN');
 readonly rows=signal<BranchOverview[]>([]); readonly users=signal<BranchOwner[]>([]);
 readonly detail=signal<BranchDetail|null>(null); readonly busy=signal(false); readonly error=signal(''); readonly message=signal('');
 readonly form=signal<FormKind|null>(null); readonly formError=signal(''); readonly tab=signal('heads');
 readonly search=signal(''); readonly includeSold=signal(false); readonly saleOffset=signal(0);
 readonly visibleLots=computed(()=>this.detail()?.lots.filter(l=>(this.includeSold()||!l.voidedAt&&l.remainingWeight>0)&&(!this.search()||[l.label,l.seller,l.note].join(' ').toLocaleLowerCase().includes(this.search().toLocaleLowerCase())))??[]);
 readonly available=computed(()=>this.detail()?.lots.filter(l=>!l.voidedAt&&l.remainingWeight>0)??[]);
 readonly tabs=computed(()=>this.admin()?[['heads','Cabezas'],['sales','Ventas'],['cash','Dinero'],['report','Reportes'],['history','Historial']]:[['heads','Cabezas'],['sales','Ventas'],['cash','Dinero']]);
 readonly report=signal<BranchReport|null>(null);
 editingId: string|null=null; private requestKey=''; private reverseKind='';
 name='';username='';phone='';password='';ownerId='';active=true;reason='';label='';seller='';weight:number|null=null;amount:number|null=null;note='';method='CASH';customer='';cashKind='EXPENSE';
 parts:Part[]=[];
 from=''; to='';
 readonly cashLabels:Record<string,string>={CAPITAL:'Capital',ADVANCE:'Anticipo',EXPENSE:'Gasto',ADVANCE_RETURN:'Devolver anticipo',ADMIN_PROFIT:'Entregar utilidad',OWNER_WITHDRAWAL:'Retirar utilidad',PURCHASE:'Compra pagada',SALE:'Venta cobrada',REVERSAL:'Anulación de movimiento'};
 ngOnInit():void{void this.load();}
 async load():Promise<void>{
  const wasBusy=this.busy(); this.busy.set(true);this.error.set('');
  try{this.rows.set(await this.api.get<BranchOverview[]>('/api/branches'));if(this.admin())this.users.set(await this.api.get<BranchOwner[]>('/api/branch-owners'));
   if(!this.admin()&&this.rows().length===1)await this.open(this.rows()[0].branch.id);
  }catch(e){this.error.set(this.problem(e));}finally{this.busy.set(wasBusy);}
 }
 async open(id:string):Promise<void>{
  this.error.set('');try{this.detail.set(await this.api.get<BranchDetail>(`/api/branches/${id}`));this.saleOffset.set(0);this.report.set(null);this.tab.set('heads');this.from='';this.to='';if(this.admin())await this.loadReport();}catch(e){this.error.set(this.problem(e));}
 }
 async refresh():Promise<void>{const id=this.detail()?.branch.id;await this.load();if(id&&this.admin())await this.open(id);}
 get selectedWeight():number{return this.parts.reduce((sum,p)=>sum+Number(p.weight??0),0);}
 get estimatedCost():number{return this.parts.reduce((sum,p)=>{const l=this.available().find(l=>l.id===p.lotId);return sum+(l&&p.weight?Math.round(Math.round(l.remainingCost*100)*Math.round(p.weight*100)/Math.round(l.remainingWeight*100))/100:0);},0);}
 get names():Record<string,string>{return Object.fromEntries([...(this.detail()?.lots??[]).map(x=>[x.id,x.label]),...this.users().map(x=>[x.id,x.fullName])]);}
 total(key: keyof BranchOverview['balances']):number{return this.rows().reduce((sum,r)=>sum+r.balances[key],0);}
 ownPending():number{return this.detail()?.owners.find(x=>x.ownerId===this.session.account()?.id)?.amount??0;}
 paymentLabel(method:string):string{return ({CASH:'Efectivo',QR:'QR',TRANSFER:'Transferencia',OTHER:'Otro'} as Record<string,string>)[method]??method;}
 begin(kind:FormKind,id:string|null=null):void{
  this.editingId=id;this.requestKey=crypto.randomUUID();this.formError.set('');this.name='';this.username='';this.phone='';this.password='';this.reason='';this.ownerId=this.detail()?.branch.ownerId??'';this.active=true;this.label='';this.seller='';this.weight=null;this.amount=null;this.note='';this.method='CASH';this.customer='';this.cashKind=this.admin()?'CAPITAL':'EXPENSE';this.parts=[{lotId:'',weight:null}];
  if(kind==='branch'&&id){this.name=this.detail()?.branch.name??'';this.active=this.detail()?.branch.active??true;}
  if(kind==='owner'&&id){const u=this.users().find(x=>x.id===id)!;this.name=u.fullName;this.username=u.username;this.phone=u.phone??'';this.active=u.active;}
  this.form.set(kind);
 }
 close():void{if(!this.busy()){this.form.set(null);this.password='';}}
 reverse(kind:string,id:string):void{this.begin('reverse',id);this.reverseKind=kind;}
 selectLot(index:number):void{const l=this.available().find(x=>x.id===this.parts[index].lotId);this.parts[index].weight=l?.remainingWeight??null;}
 addPart():void{this.parts.push({lotId:'',weight:null});}
 async save():Promise<void>{
  if(this.busy())return;const form=this.form(),branch=this.detail()?.branch.id;
  this.busy.set(true);this.formError.set('');
  try{
   const post=(path:`/api/${string}`,body:unknown)=>this.api.write<{id:string}>('POST',path,body);
   let newBranch:string|null=null;
   switch(form){
    case 'branch':if(this.editingId)await this.api.write('PUT',`/api/branches/${this.editingId}`,{name:this.name,active:this.active,reason:this.reason});else newBranch=(await post('/api/branches',{name:this.name})).id;break;
    case 'assign':await post(`/api/branches/${branch}/owner`,{ownerId:this.ownerId||null,reason:this.reason});break;
    case 'owner':if(this.editingId)await this.api.write('PUT',`/api/branch-owners/${this.editingId}`,{username:this.username,fullName:this.name,phone:this.phone,active:this.active,reason:this.reason});else await post('/api/branch-owners',{username:this.username,fullName:this.name,phone:this.phone,password:this.password});break;
    case 'delete-owner':await post(`/api/branch-owners/${this.editingId}/delete`,{reason:this.reason});break;
    case 'password':await post(`/api/branch-owners/${this.editingId}/password`,{password:this.password,reason:this.reason});break;
    case 'purchase':await post(`/api/branches/${branch}/purchases`,{requestKey:this.requestKey,label:this.label,seller:this.seller,weight:this.weight,amount:this.amount,note:this.note});break;
    case 'sale':await post(`/api/branches/${branch}/sales`,{requestKey:this.requestKey,items:this.parts,amount:this.amount,method:this.method,customer:this.customer,note:this.note});break;
    case 'mix':await post(`/api/branches/${branch}/mixes`,{requestKey:this.requestKey,label:this.label,items:this.parts,note:this.note});break;
    case 'cash':await post(`/api/branches/${branch}/cash`,{requestKey:this.requestKey,kind:this.cashKind,amount:this.amount,ownerId:this.ownerId||null,note:this.note});break;
    case 'reverse':await post(`/api/branches/${branch}/reverse`,{requestKey:this.requestKey,kind:this.reverseKind,id:this.editingId,reason:this.reason});break;
   }
   this.password='';this.form.set(null);this.message.set('Operación registrada.');await this.refresh();if(newBranch)await this.open(newBranch);
  }catch(e){this.formError.set(this.problem(e));}finally{this.busy.set(false);}
 }
 async nextSales(delta:number):Promise<void>{
  if(this.busy())return;const offset=Math.max(0,this.saleOffset()+delta);this.busy.set(true);
  try{const sales=await this.api.get<BranchDetail['sales']>(`/api/branches/${this.detail()!.branch.id}/sales?offset=${offset}`);this.detail.update(d=>d?{...d,sales}:d);this.saleOffset.set(offset);}catch(e){this.error.set(this.problem(e));}finally{this.busy.set(false);}
 }
 async loadReport():Promise<void>{
  if(!this.admin())return;
  this.busy.set(true);this.error.set('');const query=this.from||this.to?`?from=${this.from}&to=${this.to}`:'';try{this.report.set(await this.api.get<BranchReport>(`/api/branches/${this.detail()!.branch.id}/report${query}`));}catch(e){this.error.set(this.problem(e));}finally{this.busy.set(false);}
 }
 private problem(e:unknown):string{return e instanceof HttpErrorResponse&&typeof e.error?.error==='string'?e.error.error:'No se pudo completar la operación. Comprueba la conexión y vuelve a intentar.';}
}
