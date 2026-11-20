package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import static bo.lamagiadelcabello.backend.BranchMath.*;

@Service
class BranchService {
    private final JdbcTemplate db;
    private final AccountRepository accounts;
    private final PasswordEncoder passwords;
    private final ObjectMapper json;
    BranchService(JdbcTemplate db, AccountRepository accounts, PasswordEncoder passwords, ObjectMapper json) {
        this.db=db; this.accounts=accounts; this.passwords=passwords; this.json=json;
    }
    @Transactional(readOnly=true, isolation=Isolation.REPEATABLE_READ)
    public List<Overview> list(UUID actor) {
        var account=account(actor);
        if (!Set.of("ADMIN","BRANCH_OWNER").contains(account.role())) throw forbidden();
        var ids=account.role().equals("ADMIN") ? db.queryForList("SELECT id FROM branch ORDER BY name,id",UUID.class)
            : db.queryForList("SELECT branch_id FROM branch_assignment WHERE user_id=? AND ended_at IS NULL",UUID.class,actor);
        return ids.stream().map(id->new Overview(branch(id), balances(id))).toList();
    }
    @Transactional(readOnly=true, isolation=Isolation.REPEATABLE_READ)
    public Detail detail(UUID id, UUID actor) {
        access(id,actor,false);
        return new Detail(branch(id),balances(id),lots(id),sales(id,0,actor),cash(id),ownerBalances(id),account(actor).role().equals("ADMIN") ? history(id) : List.of());
    }
    @Transactional(readOnly=true)
    public List<SaleView> sales(UUID id,int offset,UUID actor) {
        access(id,actor,false);
        if(offset<0 || offset>1000000) throw bad("Página inválida.");
        return db.query("SELECT * FROM branch_sale WHERE branch_id=? ORDER BY recorded_at DESC,id DESC LIMIT 100 OFFSET ?",(r,n)->{
            UUID saleId=(UUID)r.getObject("id");
            return new SaleView(saleId, (UUID)r.getObject("owner_user_id"), r.getString("customer"),r.getBigDecimal("weight"),
                r.getBigDecimal("amount"),r.getBigDecimal("cost"),r.getBigDecimal("admin_share"),r.getBigDecimal("owner_share"),
                r.getString("method"),r.getString("note"),r.getTimestamp("recorded_at").toInstant(),instant(r.getTimestamp("voided_at")),
                db.query("SELECT i.*,l.label FROM branch_sale_item i JOIN branch_lot l ON l.id=i.lot_id WHERE sale_id=? ORDER BY i.id",
                    (row,index)->new PortionView((UUID)row.getObject("lot_id"),row.getString("label"),row.getBigDecimal("weight"),row.getBigDecimal("cost")),saleId));
        },id,offset);
    }
    @Transactional
    public UUID create(String name,UUID actor) {
        admin(actor); UUID id=UUID.randomUUID();
        db.update("INSERT INTO branch(id,name) VALUES (?,?)",id,text(name,160,true));
        audit(id,actor,"BRANCH_CREATED",null,null,branch(id)); return id;
    }
    @Transactional
    public void edit(UUID id,BranchEdit input,UUID actor) {
        admin(actor); access(id,actor,true,false); var before=branch(id);
        db.update("UPDATE branch SET name=?,active=? WHERE id=?",text(input.name(),160,true),input.active(),id);
        audit(id,actor,"BRANCH_UPDATED",reason(input.reason()),before,branch(id));
    }
    @Transactional
    public void assign(UUID id,Assign input,UUID actor) {
        admin(actor); access(id,actor,true,false); var before=branch(id); reason(input.reason());
        if(Objects.equals(before.ownerId(),input.ownerId())) throw bad("Selecciona un dueño diferente.");
        if(input.ownerId()!=null) {
            var user=accounts.findByIdForUpdate(input.ownerId()).orElseThrow(BranchService::forbidden);
            if(!user.active() || !user.role().equals("BRANCH_OWNER")) throw bad("Selecciona un dueño activo.");
            if(count("SELECT count(*) FROM branch_assignment WHERE user_id=? AND ended_at IS NULL",input.ownerId())>0)
                throw conflict("Este usuario ya tiene una sucursal asignada.");
        }
        db.update("UPDATE branch_assignment SET ended_at=now() WHERE branch_id=? AND ended_at IS NULL",id);
        if(input.ownerId()!=null) db.update("INSERT INTO branch_assignment(id,branch_id,user_id) VALUES (?,?,?)",UUID.randomUUID(),id,input.ownerId());
        if(before.ownerId()!=null) closeSessions(before.ownerId());
        if(input.ownerId()!=null) closeSessions(input.ownerId());
        audit(id,actor,"OWNER_ASSIGNED",input.reason(),before,branch(id));
    }
    @Transactional(readOnly=true)
    public List<Owner> owners(UUID actor) {
        admin(actor);
        return db.query("SELECT u.id,u.username,u.full_name,u.phone,u.active,a.branch_id,b.name FROM app_user u LEFT JOIN branch_assignment a ON a.user_id=u.id AND a.ended_at IS NULL LEFT JOIN branch b ON b.id=a.branch_id WHERE u.role='BRANCH_OWNER' AND u.deleted_at IS NULL ORDER BY u.full_name,u.id",
            (r,n)->new Owner((UUID)r.getObject("id"),r.getString("username"),r.getString("full_name"),r.getString("phone"),r.getBoolean("active"),(UUID)r.getObject("branch_id"),r.getString("name")));
    }
    @Transactional
    public UUID createOwner(OwnerInput input,UUID actor) {
        admin(actor); password(input.password()); String username=username(input.username()); UUID id=UUID.randomUUID();
        db.update("INSERT INTO app_user(id,username,username_normalized,password_hash,role,full_name,phone,active,must_change_password) VALUES (?,?,?,?,'BRANCH_OWNER',?,?,TRUE,FALSE)",
            id,username,username.toLowerCase(Locale.ROOT),passwords.encode(input.password()),text(input.fullName(),160,true),text(input.phone(),40,false));
        accountHistory(id,actor,"ACCOUNT_CREATED",null); return id;
    }
    @Transactional
    public void editOwner(UUID id,OwnerEdit input,UUID actor) {
        admin(actor); var before=accounts.findByIdForUpdate(id).orElseThrow(BranchService::forbidden);
        if(!before.role().equals("BRANCH_OWNER")) throw forbidden();
        String username=username(input.username()); reason(input.reason());
        db.update("UPDATE app_user SET username=?,username_normalized=?,full_name=?,phone=?,active=?,updated_at=now(),session_version=session_version+1 WHERE id=?",username,username.toLowerCase(Locale.ROOT),text(input.fullName(),160,true),text(input.phone(),40,false),input.active(),id);
        closeSessions(id); accountHistory(id,actor,"ACCOUNT_UPDATED",input.reason());
    }
    @Transactional
    public void resetOwner(UUID id,OwnerPassword input,UUID actor) {
        admin(actor); var user=accounts.findByIdForUpdate(id).orElseThrow(BranchService::forbidden);
        if(!user.role().equals("BRANCH_OWNER")) throw forbidden(); password(input.password()); reason(input.reason());
        db.update("UPDATE app_user SET password_hash=?,must_change_password=FALSE,password_changed_at=now(),updated_at=now(),session_version=session_version+1 WHERE id=?",passwords.encode(input.password()),id);
        closeSessions(id); accountHistory(id,actor,"PASSWORD_RESET",input.reason());
    }
    @Transactional
    public void deleteOwner(UUID id,String reason,UUID actor) {
        admin(actor);reason(reason);
        var user=accounts.findByIdForUpdate(id).orElseThrow(BranchService::forbidden);
        if(!user.role().equals("BRANCH_OWNER"))throw forbidden();
        var assigned=db.queryForList("SELECT branch_id FROM branch_assignment WHERE user_id=? AND ended_at IS NULL",UUID.class,id);
        db.update("UPDATE branch_assignment SET ended_at=now() WHERE user_id=? AND ended_at IS NULL",id);
        for(UUID branch:assigned) audit(branch,actor,"OWNER_REMOVED",reason,Map.of("ownerName",user.displayName()),null);
        db.update("INSERT INTO app_user_history(user_id,event_type,source,actor_user_id,reason,old_values,new_values) VALUES (?,'ACCOUNT_DELETED','ADMIN_PANEL',?,?,?::jsonb,?::jsonb)",
            id,actor,reason,json.writeValueAsString(Map.of("username",user.username(),"fullName",user.displayName(),"active",user.active())),
            json.writeValueAsString(Map.of("active",false,"deleted",true)));
        db.update("UPDATE app_user SET deleted_at=now(),active=FALSE,session_version=session_version+1,updated_at=now() WHERE id=?",id);
        closeSessions(id);
    }
    @Transactional
    public UUID purchase(UUID id,PurchaseInput input,UUID actor) {
        access(id,actor,true); var existing=existing("branch_lot",id,input.requestKey(),hash(input)); if(existing!=null) return existing;
        BigDecimal weight=positive(input.weight(),"peso"), amount=positive(input.amount(),"importe");
        if(amount.compareTo(balances(id).operatingCash())>0) throw conflict("No hay capital disponible suficiente. Registra un aporte o anticipo.");
        UUID lot=UUID.randomUUID();
        insertLot(id,lot,"PURCHASE",input.label(),input.seller(),weight,amount,input.note(),actor,input.requestKey(),hash(input));
        entry(id,"PURCHASE",amount.negate(),ZERO,ZERO,ZERO,ZERO,null,"Compra: "+text(input.label(),160,true),actor,lot,null,lot,hash(input));
        audit(id,actor,"HEAD_PURCHASED",input.note(),null,lot(id,lot)); return lot;
    }
    @Transactional
    public UUID mix(UUID id,MixInput input,UUID actor) {
        access(id,actor,true); var existing=existing("branch_lot",id,input.requestKey(),hash(input)); if(existing!=null) return existing;
        List<Consumed> portions=consume(id,input.items());
        if(portions.size()<2) throw bad("Selecciona al menos dos cabezas o mezclas distintas.");
        BigDecimal weight=portions.stream().map(Consumed::weight).reduce(ZERO,BigDecimal::add), cost=portions.stream().map(Consumed::cost).reduce(ZERO,BigDecimal::add);
        UUID mixed=UUID.randomUUID(); insertLot(id,mixed,"MIX",input.label(),"",weight,cost,input.note(),actor,input.requestKey(),hash(input));
        for(var part:portions) db.update("INSERT INTO branch_mix_item(id,branch_id,mix_lot_id,source_lot_id,weight,cost) VALUES (?,?,?,?,?,?)",UUID.randomUUID(),id,mixed,part.lotId(),part.weight(),part.cost());
        audit(id,actor,"HEADS_MIXED",input.note(),portions,lot(id,mixed));return mixed;
    }
    @Transactional
    public UUID sell(UUID id,SaleInput input,UUID actor) {
        access(id,actor,true); var existing=existing("branch_sale",id,input.requestKey(),hash(input)); if(existing!=null) return existing;
        UUID owner=branch(id).ownerId(); if(owner==null) throw conflict("Asigna un dueño antes de registrar ventas.");
        var portions=consume(id,input.items());
        BigDecimal cost=portions.stream().map(Consumed::cost).reduce(ZERO,BigDecimal::add),weight=portions.stream().map(Consumed::weight).reduce(ZERO,BigDecimal::add),amount=positive(input.amount(),"importe");
        if(amount.compareTo(cost)<0) throw bad("La venta no puede generar pérdida. El costo del cabello seleccionado es Bs. "+cost.toPlainString()+".");
        if(input.method()==null || !Set.of("CASH","QR","TRANSFER","OTHER").contains(input.method())) throw bad("Selecciona un método de pago válido.");
        BigDecimal admin=adminShare(amount.subtract(cost)),ownerShare=amount.subtract(cost).subtract(admin); UUID sale=UUID.randomUUID();
        db.update("INSERT INTO branch_sale(id,branch_id,owner_user_id,customer,weight,amount,cost,admin_share,owner_share,method,note,actor_user_id,request_key,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            sale,id,owner,text(input.customer(),160,false),weight,amount,cost,admin,ownerShare,input.method(),text(input.note(),500,false),actor,input.requestKey(),hash(input));
        for(var part:portions) db.update("INSERT INTO branch_sale_item(id,branch_id,sale_id,lot_id,weight,cost) VALUES (?,?,?,?,?,?)",UUID.randomUUID(),id,sale,part.lotId(),part.weight(),part.cost());
        entry(id,"SALE",amount,ZERO,ZERO,admin,ownerShare,owner,"Cobro de venta",actor,sale,null,sale,hash(input));
        audit(id,actor,"HEAD_SOLD",input.note(),null,Map.of("saleId",sale,"weight",weight,"amount",amount,"cost",cost,"adminShare",admin,"ownerShare",ownerShare,"items",portions)); return sale;
    }
    @Transactional
    public UUID cash(UUID id,CashInput input,UUID actor) {
        access(id,actor,true); var existing=existing("branch_cash_entry",id,input.requestKey(),hash(input));if(existing!=null)return existing;
        BigDecimal amount=positive(input.amount(),"importe"),cash=ZERO,capital=ZERO,advance=ZERO,admin=ZERO,owner=ZERO;UUID ownerId=null;
        String kind=input.kind()==null?"":input.kind(); reason(input.note());
        switch(kind) {
            case "CAPITAL" -> {admin(actor);cash=amount;capital=amount;}
            case "ADVANCE" -> {admin(actor);cash=amount;advance=amount;}
            case "EXPENSE" -> cash=amount.negate();
            case "ADVANCE_RETURN" -> {admin(actor);cash=amount.negate();advance=amount.negate();}
            case "ADMIN_PROFIT" -> {admin(actor);cash=amount.negate();admin=amount.negate();}
            case "OWNER_WITHDRAWAL" -> {
                ownerId=account(actor).role().equals("ADMIN")?input.ownerId():actor;
                if(ownerId==null) throw bad("Selecciona el dueño que recibe el retiro.");
                if(ownerBalance(id,ownerId).compareTo(amount)<0) throw conflict("El retiro supera la utilidad pendiente de este dueño.");
                cash=amount.negate();owner=amount.negate();
            }
            default -> throw bad("Tipo de movimiento inválido.");
        }
        UUID result=UUID.randomUUID(); entry(id,kind,cash,capital,advance,admin,owner,ownerId,input.note(),actor,null,null,input.requestKey(),hash(input),result);
        validateBalances(id);audit(id,actor,"CASH_RECORDED",input.note(),null,Map.of("entryId",result,"kind",kind,"amount",amount));return result;
    }
    @Transactional
    public UUID reverse(UUID id,ReverseInput input,UUID actor) {
        admin(actor);access(id,actor,true);reason(input.reason());
        var existing=existing("branch_cash_entry",id,input.requestKey(),hash(input)); if(existing!=null)return existing;
        var previousMix=db.queryForList("SELECT id,void_request_hash FROM branch_lot WHERE branch_id=? AND void_request_key=?",id,input.requestKey());
        if(!previousMix.isEmpty()) {
            if(!hash(input).equals(previousMix.getFirst().get("void_request_hash")))throw conflict("La solicitud ya fue usada con otros datos.");
            return (UUID)previousMix.getFirst().get("id");
        }
        UUID reference=input.id();
        if(input.kind().equals("SALE")) {
            var sale=db.queryForList("SELECT * FROM branch_sale WHERE id=? AND branch_id=? AND voided_at IS NULL FOR UPDATE",reference,id);
            if(sale.isEmpty())throw conflict("La venta no existe o ya fue anulada.");
            restoreParts(id,"branch_sale_item","sale_id","lot_id",reference);
            db.update("UPDATE branch_sale SET voided_at=now() WHERE id=?",reference);
        } else if(input.kind().equals("PURCHASE") || input.kind().equals("MIX")) {
            Lot before=lot(id,reference);
            if(before.voidedAt()!=null || !before.kind().equals(input.kind()) || before.remainingWeight().compareTo(before.originalWeight())!=0 || before.remainingCost().compareTo(before.originalCost())!=0)
                throw conflict("Solo puede anularse una cabeza o mezcla con todo su peso disponible. Anula primero sus movimientos posteriores.");
            if(input.kind().equals("MIX")) restoreParts(id,"branch_mix_item","mix_lot_id","source_lot_id",reference);
            db.update("UPDATE branch_lot SET voided_at=now(),remaining_weight=0,remaining_cost=0,void_request_key=?,void_request_hash=? WHERE id=?",input.requestKey(),hash(input),reference);
            if(input.kind().equals("MIX")) {audit(id,actor,"MIX_VOIDED",input.reason(),before,null); return reference;}
        } else if(!input.kind().equals("CASH"))throw bad("Tipo de anulación inválido.");
        var rows=input.kind().equals("CASH")?db.queryForList("SELECT * FROM branch_cash_entry WHERE id=? AND branch_id=?",reference,id)
            :db.queryForList("SELECT * FROM branch_cash_entry WHERE reference_id=? AND branch_id=? AND kind=?",reference,id,input.kind());
        if(rows.size()!=1)throw bad("Movimiento no encontrado.");var row=rows.getFirst();
        if(row.get("kind").equals("REVERSAL") || input.kind().equals("CASH") && Set.of("SALE","PURCHASE").contains(row.get("kind")))throw bad("Anula la compra o venta desde su operación de origen.");
        UUID original=(UUID)row.get("id");
        if(count("SELECT count(*) FROM branch_cash_entry WHERE reversal_of=?",original)>0)throw conflict("El movimiento ya fue anulado.");
        UUID result=UUID.randomUUID();entry(id,"REVERSAL",neg(row,"cash_delta"),neg(row,"capital_delta"),neg(row,"advance_delta"),neg(row,"admin_delta"),neg(row,"owner_delta"),(UUID)row.get("owner_user_id"),input.reason(),actor,reference,original,input.requestKey(),hash(input),result);
        validateBalances(id);audit(id,actor,"MOVEMENT_VOIDED",input.reason(),Map.of("kind",input.kind(),"id",reference),Map.of("reversalId",result));return result;
    }
    private List<Consumed> consume(UUID branch,List<Part> items) {
        if(items==null || items.isEmpty() || items.size()>100)throw bad("Selecciona de 1 a 100 cabezas o mezclas.");
        Set<UUID> seen=new HashSet<>();List<Consumed> result=new ArrayList<>();
        for(Part part:items) {
            if(part==null || part.lotId()==null || !seen.add(part.lotId()))throw bad("Hay una cabeza repetida o inválida.");
            Lot lot=lot(branch,part.lotId());BigDecimal weight=positive(part.weight(),"peso");
            if(lot.voidedAt()!=null)throw conflict("La cabeza está anulada.");
            BigDecimal cost=portion(lot.remainingCost(),lot.remainingWeight(),weight);
            db.update("UPDATE branch_lot SET remaining_weight=remaining_weight-?,remaining_cost=remaining_cost-? WHERE id=? AND branch_id=?",weight,cost,lot.id(),branch);
            result.add(new Consumed(lot.id(),weight,cost));
        }return result;
    }
    private void restoreParts(UUID id,String table,String referenceField,String lotField,UUID reference) {
        for(var row:db.queryForList("SELECT * FROM "+table+" WHERE "+referenceField+"=? AND branch_id=?",reference,id)) {
            if(db.update("UPDATE branch_lot SET remaining_weight=remaining_weight+?,remaining_cost=remaining_cost+? WHERE id=? AND branch_id=? AND voided_at IS NULL",row.get("weight"),row.get("cost"),row.get(lotField),id)!=1)throw conflict("No se puede recuperar un lote anulado.");
        }
    }
    private void insertLot(UUID branch,UUID id,String kind,String label,String seller,BigDecimal weight,BigDecimal cost,String note,UUID actor,UUID request,String hash) {
        if(request==null)throw bad("Falta la clave de la solicitud.");
        db.update("INSERT INTO branch_lot(id,branch_id,kind,label,seller,original_weight,remaining_weight,original_cost,remaining_cost,note,actor_user_id,request_key,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",id,branch,kind,text(label,160,true),text(seller,160,false),weight,weight,cost,cost,text(note,500,false),actor,request,hash);
    }
    private void entry(UUID branch,String kind,BigDecimal cash,BigDecimal capital,BigDecimal advance,BigDecimal admin,BigDecimal owner,UUID ownerId,String note,UUID actor,UUID reference,UUID reversal,UUID request,String hash) {
        entry(branch,kind,cash,capital,advance,admin,owner,ownerId,note,actor,reference,reversal,request,hash,UUID.randomUUID());
    }
    private void entry(UUID branch,String kind,BigDecimal cash,BigDecimal capital,BigDecimal advance,BigDecimal admin,BigDecimal owner,UUID ownerId,String note,UUID actor,UUID reference,UUID reversal,UUID request,String hash,UUID result) {
        if(request==null)throw bad("Falta la clave de la solicitud.");
        db.update("INSERT INTO branch_cash_entry(id,branch_id,kind,cash_delta,capital_delta,advance_delta,admin_delta,owner_delta,owner_user_id,note,actor_user_id,reference_id,reversal_of,request_key,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",result,branch,kind,cash,capital,advance,admin,owner,ownerId,text(note,500,true),actor,reference,reversal,request,hash);
    }
    private UUID existing(String table,UUID branch,UUID key,String hash) {
        if(key==null)throw bad("Falta la clave de la solicitud.");
        var rows=db.queryForList("SELECT id,request_hash FROM "+table+" WHERE branch_id=? AND request_key=?",branch,key);
        if(rows.isEmpty())return null;
        if(!hash.equals(rows.getFirst().get("request_hash")))throw conflict("La solicitud ya fue usada con otros datos.");
        return (UUID)rows.getFirst().get("id");
    }
    private BranchView branch(UUID id) {
        return db.query("SELECT b.*,a.user_id,u.full_name FROM branch b LEFT JOIN branch_assignment a ON a.branch_id=b.id AND a.ended_at IS NULL LEFT JOIN app_user u ON u.id=a.user_id WHERE b.id=?",(r,n)->new BranchView((UUID)r.getObject("id"),r.getString("name"),r.getBoolean("active"),(UUID)r.getObject("user_id"),r.getString("full_name")),id)
            .stream().findFirst().orElseThrow(()->new Problem(HttpStatus.NOT_FOUND,"Sucursal no encontrada."));
    }
    private void access(UUID id,UUID actor,boolean write) {access(id,actor,write,true);}
    private void access(UUID id,UUID actor,boolean write,boolean requireActive) {
        var user=account(actor);
        if(write && db.queryForList("SELECT id FROM branch WHERE id=? FOR UPDATE",UUID.class,id).isEmpty())throw new Problem(HttpStatus.NOT_FOUND,"Sucursal no encontrada.");
        var branch=branch(id);
        if(!user.role().equals("ADMIN") && (!user.role().equals("BRANCH_OWNER") || !Objects.equals(branch.ownerId(),actor)))throw forbidden();
        if(write && requireActive && !branch.active())throw conflict("La sucursal está desactivada.");
    }
    private AccountRepository.Account account(UUID id) {
        var user=accounts.findById(id).orElseThrow(BranchService::forbidden);if(!user.active())throw forbidden();return user;
    }
    private void admin(UUID actor) {if(!account(actor).role().equals("ADMIN"))throw forbidden();}
    private Balances balances(UUID id) {
        return db.queryForObject("SELECT COALESCE(SUM(cash_delta),0) cash,COALESCE(SUM(capital_delta),0) capital,COALESCE(SUM(advance_delta),0) advance,COALESCE(SUM(admin_delta),0) admin,COALESCE(SUM(owner_delta),0) owner FROM branch_cash_entry WHERE branch_id=?",(r,n)->{
            BigDecimal cash=r.getBigDecimal("cash"),admin=r.getBigDecimal("admin"),owner=r.getBigDecimal("owner");
            return new Balances(cash,r.getBigDecimal("capital"),r.getBigDecimal("advance"),admin,owner,cash.subtract(admin).subtract(owner),
                number("SELECT COALESCE(SUM(remaining_cost),0) FROM branch_lot WHERE branch_id=? AND voided_at IS NULL",id),
                number("SELECT COALESCE(SUM(remaining_weight),0) FROM branch_lot WHERE branch_id=? AND voided_at IS NULL",id));
        },id);
    }
    private void validateBalances(UUID id) {
        var b=balances(id);
        if(b.cash().signum()<0 || b.capital().signum()<0 || b.advance().signum()<0 || b.adminDue().signum()<0 || b.ownerDue().signum()<0 || b.operatingCash().signum()<0
            || ownerBalances(id).stream().anyMatch(x->x.amount().signum()<0))throw conflict("El movimiento deja caja, capital, anticipos o utilidades sin respaldo. Revisa los saldos y las entregas anteriores.");
    }
    private BigDecimal ownerBalance(UUID id,UUID owner) {return number("SELECT COALESCE(SUM(owner_delta),0) FROM branch_cash_entry WHERE branch_id=? AND owner_user_id=?",id,owner);}
    private List<OwnerBalance> ownerBalances(UUID id) {
        return db.query("SELECT u.id,u.full_name,SUM(e.owner_delta) amount FROM branch_cash_entry e JOIN app_user u ON u.id=e.owner_user_id WHERE e.branch_id=? GROUP BY u.id,u.full_name ORDER BY u.full_name",(r,n)->new OwnerBalance((UUID)r.getObject("id"),r.getString("full_name"),r.getBigDecimal("amount")),id);
    }
    private List<Lot> lots(UUID id) {return db.query("SELECT * FROM branch_lot WHERE branch_id=? ORDER BY recorded_at DESC,id DESC",this::mapLot,id);}
    private Lot lot(UUID branch,UUID id) {return db.query("SELECT * FROM branch_lot WHERE branch_id=? AND id=?",this::mapLot,branch,id).stream().findFirst().orElseThrow(()->new Problem(HttpStatus.NOT_FOUND,"Cabeza no encontrada en esta sucursal."));}
    private Lot mapLot(java.sql.ResultSet r,int n)throws java.sql.SQLException {
        UUID id=(UUID)r.getObject("id");return new Lot(id,r.getString("kind"),r.getString("label"),r.getString("seller"),r.getBigDecimal("original_weight"),r.getBigDecimal("remaining_weight"),r.getBigDecimal("original_cost"),r.getBigDecimal("remaining_cost"),r.getString("note"),r.getTimestamp("recorded_at").toInstant(),instant(r.getTimestamp("voided_at")),
            db.query("SELECT i.source_lot_id,l.label,i.weight,i.cost FROM branch_mix_item i JOIN branch_lot l ON l.id=i.source_lot_id WHERE i.mix_lot_id=? ORDER BY i.id",(row,index)->new PortionView((UUID)row.getObject("source_lot_id"),row.getString("label"),row.getBigDecimal("weight"),row.getBigDecimal("cost")),id));
    }
    private List<CashView> cash(UUID id) {
        return db.query("SELECT e.*,u.full_name owner_name,a.full_name actor_name,EXISTS(SELECT 1 FROM branch_cash_entry r WHERE r.reversal_of=e.id) reversed FROM branch_cash_entry e LEFT JOIN app_user u ON u.id=e.owner_user_id JOIN app_user a ON a.id=e.actor_user_id WHERE e.branch_id=? ORDER BY e.recorded_at DESC,e.id DESC",(r,n)->new CashView((UUID)r.getObject("id"),r.getString("kind"),r.getBigDecimal("cash_delta"),r.getBigDecimal("advance_delta"),r.getBigDecimal("admin_delta"),r.getBigDecimal("owner_delta"),r.getString("owner_name"),r.getString("actor_name"),r.getString("note"),r.getTimestamp("recorded_at").toInstant(),instant(r.getTimestamp("confirmed_at")),r.getBoolean("reversed"),(UUID)r.getObject("reference_id")),id);
    }
    private List<Audit> history(UUID id) {
        return db.query("SELECT h.*,u.full_name actor_name FROM branch_history h JOIN app_user u ON u.id=h.actor_user_id WHERE branch_id=? ORDER BY recorded_at DESC,h.id DESC LIMIT 500",(r,n)->new Audit(r.getLong("id"),r.getTimestamp("recorded_at").toInstant(),r.getString("event_type"),r.getString("actor_name"),r.getString("reason"),parse(r.getString("old_values")),parse(r.getString("new_values"))),id);
    }
    @Transactional(readOnly=true)
    public Report report(UUID id,String from,String to,UUID actor) {
        admin(actor); access(id,actor,false);
        java.time.LocalDate start,end;
        boolean all=from==null && to==null;
        try {start=all?java.time.LocalDate.of(1,1,1):java.time.LocalDate.parse(from);end=all?java.time.LocalDate.of(9999,12,31):java.time.LocalDate.parse(to);}catch(Exception e){throw bad("Indica ambas fechas o consulta todos los registros.");}
        if(!all && (end.isBefore(start)||end.isAfter(start.plusYears(5))))throw bad("Indica un periodo de hasta cinco años.");
        return db.queryForObject("SELECT COUNT(*) quantity,COALESCE(SUM(weight),0) weight,COALESCE(SUM(amount),0) revenue,COALESCE(SUM(cost),0) cost,COALESCE(SUM(admin_share),0) admin,COALESCE(SUM(owner_share),0) owner FROM branch_sale WHERE branch_id=? AND voided_at IS NULL AND (recorded_at AT TIME ZONE 'America/La_Paz')::date BETWEEN ? AND ?",(r,n)->new Report(r.getLong("quantity"),r.getBigDecimal("weight"),r.getBigDecimal("revenue"),r.getBigDecimal("cost"),r.getBigDecimal("admin"),r.getBigDecimal("owner"),number("SELECT COALESCE(SUM(original_cost),0) FROM branch_lot WHERE branch_id=? AND kind='PURCHASE' AND voided_at IS NULL AND (recorded_at AT TIME ZONE 'America/La_Paz')::date BETWEEN ? AND ?",id,start,end),
            cashTotal(id,"CAPITAL",start,end,false),cashTotal(id,"ADVANCE",start,end,false),cashTotal(id,"EXPENSE",start,end,true),
            cashTotal(id,"ADVANCE_RETURN",start,end,true),cashTotal(id,"ADMIN_PROFIT",start,end,true),cashTotal(id,"OWNER_WITHDRAWAL",start,end,true)),id,start,end);
    }
    private BigDecimal cashTotal(UUID id,String kind,java.time.LocalDate start,java.time.LocalDate end,boolean outgoing) {
        BigDecimal result=number("SELECT COALESCE(SUM(e.cash_delta),0) FROM branch_cash_entry e LEFT JOIN branch_cash_entry original ON original.id=e.reversal_of WHERE e.branch_id=? AND COALESCE(original.kind,e.kind)=? AND (e.recorded_at AT TIME ZONE 'America/La_Paz')::date BETWEEN ? AND ?",id,kind,start,end);
        return outgoing?result.negate():result;
    }
    private void audit(UUID branch,UUID actor,String event,String reason,Object old,Object value) {
        db.update("INSERT INTO branch_history(branch_id,actor_user_id,event_type,reason,old_values,new_values) VALUES (?,?,?,?,?::jsonb,?::jsonb)",branch,actor,event,reason,json.writeValueAsString(old),json.writeValueAsString(value));
    }
    private Object parse(String s) {return s==null?null:json.readTree(s);}
    private void accountHistory(UUID id,UUID actor,String event,String reason) {
        var user=accounts.findById(id).orElseThrow(BranchService::forbidden); db.update("INSERT INTO app_user_history(user_id,event_type,source,actor_user_id,reason,new_values) VALUES (?,?,'ADMIN_PANEL',?,?,?::jsonb)",id,event,actor,reason,json.writeValueAsString(Map.of("username",user.username(),"fullName",user.displayName(),"active",user.active())));
    }
    private void closeSessions(UUID id) {db.update("DELETE FROM spring_session WHERE principal_name=?",id.toString());}
    private long count(String sql,Object...args) {return db.queryForObject(sql,Long.class,args);}
    private BigDecimal number(String sql,Object...args) {return db.queryForObject(sql,BigDecimal.class,args);}
    private static BigDecimal neg(Map<String,Object> row,String key) {return ((BigDecimal)row.get(key)).negate();}
    private String hash(Object input) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(input)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    private static Instant instant(java.sql.Timestamp t) {return t==null?null:t.toInstant();}
    private static String text(String value,int max,boolean required) {String s=value==null?"":value.trim();if(s.length()>max || required&&s.isBlank())throw bad("Completa el texto requerido (máximo "+max+" caracteres).");return s;}
    private static String reason(String s) {return text(s,500,true);}
    private static String username(String s) {s=text(s,80,true);if(!s.matches("[\\p{L}\\p{N}._-]+"))throw bad("El usuario solo admite letras, números, puntos y guiones, sin espacios.");return s;}
    private static void password(String s) {if(s==null||s.isBlank()||s.getBytes(StandardCharsets.UTF_8).length>72)throw bad("Indica una contraseña no vacía de hasta 72 bytes.");}
    private static Problem bad(String s) {return new Problem(HttpStatus.BAD_REQUEST,s);}
    private static Problem conflict(String s) {return new Problem(HttpStatus.CONFLICT,s);}
    private static Problem forbidden() {return new Problem(HttpStatus.FORBIDDEN,"No tienes acceso a esta sucursal o acción.");}
    static final class Problem extends RuntimeException {final HttpStatus status; Problem(HttpStatus status,String message){super(message);this.status=status;}}
    record BranchView(UUID id,String name,boolean active,UUID ownerId,String ownerName){}
    record Balances(BigDecimal cash,BigDecimal capital,BigDecimal advance,BigDecimal adminDue,BigDecimal ownerDue,BigDecimal operatingCash,BigDecimal stockCost,BigDecimal stockWeight){}
    record Overview(BranchView branch,Balances balances){}
    record Owner(UUID id,String username,String fullName,String phone,boolean active,UUID branchId,String branchName){}
    record OwnerBalance(UUID ownerId,String ownerName,BigDecimal amount){}
    record Lot(UUID id,String kind,String label,String seller,BigDecimal originalWeight,BigDecimal remainingWeight,BigDecimal originalCost,BigDecimal remainingCost,String note,Instant recordedAt,Instant voidedAt,List<PortionView> sources){}
    record PortionView(UUID lotId,String label,BigDecimal weight,BigDecimal cost){}
    record SaleView(UUID id,UUID ownerId,String customer,BigDecimal weight,BigDecimal amount,BigDecimal cost,BigDecimal adminShare,BigDecimal ownerShare,String method,String note,Instant recordedAt,Instant voidedAt,List<PortionView> items){}
    record CashView(UUID id,String kind,BigDecimal cashDelta,BigDecimal advanceDelta,BigDecimal adminDelta,BigDecimal ownerDelta,String ownerName,String actorName,String note,Instant recordedAt,Instant confirmedAt,boolean reversed,UUID referenceId){}
    record Audit(long id,Instant changedAt,String eventType,String actorName,String reason,Object oldValues,Object newValues){}
    record Detail(BranchView branch,Balances balances,List<Lot> lots,List<SaleView> sales,List<CashView> cash,List<OwnerBalance> owners,List<Audit> history){}
    record BranchEdit(String name,boolean active,String reason){}
    record Assign(UUID ownerId,String reason){}
    record OwnerInput(String username,String fullName,String phone,String password){}
    record OwnerEdit(String username,String fullName,String phone,boolean active,String reason){}
    record OwnerPassword(String password,String reason){}
    record PurchaseInput(UUID requestKey,String label,String seller,BigDecimal weight,BigDecimal amount,String note){}
    record Part(UUID lotId,BigDecimal weight){}
    record MixInput(UUID requestKey,String label,List<Part> items,String note){}
    record SaleInput(UUID requestKey,List<Part> items,BigDecimal amount,String method,String customer,String note){}
    record CashInput(UUID requestKey,String kind,BigDecimal amount,UUID ownerId,String note){}
    record ReverseInput(UUID requestKey,String kind,UUID id,String reason){}
    record Consumed(UUID lotId,BigDecimal weight,BigDecimal cost){}
    record Report(long quantity,BigDecimal weight,BigDecimal revenue,BigDecimal cost,BigDecimal adminShare,BigDecimal ownerShare,BigDecimal purchases,BigDecimal capital,BigDecimal advances,BigDecimal expenses,BigDecimal advanceReturns,BigDecimal adminDeliveries,BigDecimal ownerWithdrawals){}
}
