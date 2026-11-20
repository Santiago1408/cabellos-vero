package bo.lamagiadelcabello.backend;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
final class BranchIntegrity {
 static void validate(JdbcTemplate db) {
  check(db,"""
   WITH RECURSIVE chain(node,path,cycle) AS (
    SELECT source_lot_id,ARRAY[mix_lot_id,source_lot_id],false FROM branch_mix_item
    UNION ALL SELECT i.source_lot_id,c.path||i.source_lot_id,i.source_lot_id=ANY(c.path)
      FROM chain c JOIN branch_mix_item i ON i.mix_lot_id=c.node WHERE NOT c.cycle)
   SELECT count(*) FROM chain WHERE cycle
   ""","El respaldo contiene un ciclo entre mezclas.");
  check(db,"SELECT count(*) FROM branch_assignment a JOIN app_user u ON u.id=a.user_id WHERE u.role<>'BRANCH_OWNER'","Una asignación no pertenece a un dueño.");
  check(db,"""
   SELECT count(*) FROM branch_lot l WHERE l.voided_at IS NULL AND (
    l.remaining_weight<>l.original_weight
     -COALESCE((SELECT SUM(i.weight) FROM branch_sale_item i JOIN branch_sale s ON s.id=i.sale_id WHERE i.lot_id=l.id AND s.voided_at IS NULL),0)
     -COALESCE((SELECT SUM(i.weight) FROM branch_mix_item i JOIN branch_lot m ON m.id=i.mix_lot_id WHERE i.source_lot_id=l.id AND m.voided_at IS NULL),0)
    OR l.remaining_cost<>l.original_cost
     -COALESCE((SELECT SUM(i.cost) FROM branch_sale_item i JOIN branch_sale s ON s.id=i.sale_id WHERE i.lot_id=l.id AND s.voided_at IS NULL),0)
     -COALESCE((SELECT SUM(i.cost) FROM branch_mix_item i JOIN branch_lot m ON m.id=i.mix_lot_id WHERE i.source_lot_id=l.id AND m.voided_at IS NULL),0))
   ""","El inventario de sucursales no coincide con ventas y mezclas.");
  check(db,"""
   SELECT count(*) FROM branch_sale s WHERE s.weight<>COALESCE((SELECT SUM(weight) FROM branch_sale_item WHERE sale_id=s.id),0)
    OR s.cost<>COALESCE((SELECT SUM(cost) FROM branch_sale_item WHERE sale_id=s.id),0) OR s.admin_share<>trunc((s.amount-s.cost)/2,2)
   ""","Los costos o reparto de una venta son inconsistentes.");
  check(db,"""
   SELECT count(*) FROM branch_lot l WHERE l.kind='MIX' AND (
    l.original_weight<>COALESCE((SELECT SUM(weight) FROM branch_mix_item WHERE mix_lot_id=l.id),0)
    OR l.original_cost<>COALESCE((SELECT SUM(cost) FROM branch_mix_item WHERE mix_lot_id=l.id),0))
   ""","El costo o peso de una mezcla no coincide con su origen.");
  check(db,"""
   SELECT count(*) FROM branch_mix_item i JOIN branch_lot m ON m.id=i.mix_lot_id JOIN branch_lot s ON s.id=i.source_lot_id
   WHERE m.kind<>'MIX' OR s.recorded_at>m.recorded_at OR (m.voided_at IS NULL AND s.voided_at IS NOT NULL)
   ""","Hay una mezcla con origen inválido.");
  check(db,"""
   SELECT count(*) FROM (SELECT branch_id FROM branch_cash_entry GROUP BY branch_id HAVING SUM(cash_delta)<0
    OR SUM(capital_delta)<0 OR SUM(advance_delta)<0 OR SUM(admin_delta)<0 OR SUM(owner_delta)<0
    OR SUM(cash_delta-admin_delta-owner_delta)<0) invalid
   ""","Los saldos de una sucursal no tienen respaldo.");
  check(db,"SELECT count(*) FROM (SELECT branch_id,owner_user_id FROM branch_cash_entry GROUP BY branch_id,owner_user_id HAVING SUM(owner_delta)<0) invalid","Un retiro supera la utilidad del dueño.");
  check(db,"""
   SELECT count(*) FROM branch_cash_entry r LEFT JOIN branch_cash_entry o ON o.id=r.reversal_of WHERE
   (r.kind='REVERSAL' AND (o.id IS NULL OR o.kind='REVERSAL' OR o.branch_id<>r.branch_id OR r.cash_delta<>-o.cash_delta
    OR r.capital_delta<>-o.capital_delta OR r.advance_delta<>-o.advance_delta OR r.admin_delta<>-o.admin_delta
    OR r.owner_delta<>-o.owner_delta OR r.owner_user_id IS DISTINCT FROM o.owner_user_id))
   OR (r.kind<>'REVERSAL' AND r.reversal_of IS NOT NULL)
   ""","Una reversión no coincide con su original.");
  check(db,"""
   SELECT count(*) FROM branch_lot l WHERE l.kind='PURCHASE' AND
   ((SELECT count(*) FROM branch_cash_entry e WHERE e.reference_id=l.id AND e.branch_id=l.branch_id AND e.kind='PURCHASE' AND e.cash_delta=-l.original_cost)<>1
    OR (l.voided_at IS NOT NULL)<>EXISTS(SELECT 1 FROM branch_cash_entry e JOIN branch_cash_entry r ON r.reversal_of=e.id WHERE e.reference_id=l.id AND e.kind='PURCHASE'))
   ""","Una compra no coincide con su pago.");
  check(db,"""
   SELECT count(*) FROM branch_sale s WHERE
   ((SELECT count(*) FROM branch_cash_entry e WHERE e.reference_id=s.id AND e.branch_id=s.branch_id AND e.kind='SALE'
     AND e.cash_delta=s.amount AND e.admin_delta=s.admin_share AND e.owner_delta=s.owner_share AND e.owner_user_id=s.owner_user_id)<>1
    OR (s.voided_at IS NOT NULL)<>EXISTS(SELECT 1 FROM branch_cash_entry e JOIN branch_cash_entry r ON r.reversal_of=e.id WHERE e.reference_id=s.id AND e.kind='SALE'))
   ""","Una venta no coincide con su cobro.");
 }
 private static void check(JdbcTemplate db,String sql,String message) {
  if(db.queryForObject(sql,Long.class)>0)throw new BackupService.BackupProblem(HttpStatus.BAD_REQUEST,message);
 }
}
