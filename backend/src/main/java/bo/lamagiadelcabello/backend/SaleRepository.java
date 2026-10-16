package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class SaleRepository {

    private static final String COLUMNS = """
        id, request_key, request_hash, customer_name, operation_date,
        accepted_pending_stock, status, created_at, confirmed_at,
        canceled_at, updated_at, version
        """;

    private final JdbcTemplate jdbc;

    SaleRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<Sale> list() {
        return jdbc.query("SELECT " + COLUMNS + " FROM sale_order "
            + "ORDER BY operation_date DESC, created_at DESC, id DESC",
            SaleRepository::mapSale);
    }

    Optional<Sale> findById(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM sale_order WHERE id = ?",
            SaleRepository::mapSale, id).stream().findFirst();
    }

    Optional<Sale> findByIdForUpdate(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM sale_order WHERE id = ? FOR UPDATE",
            SaleRepository::mapSale, id).stream().findFirst();
    }

    Optional<Sale> findByRequestKey(UUID requestKey) {
        return jdbc.query("SELECT " + COLUMNS + " FROM sale_order WHERE request_key = ?",
            SaleRepository::mapSale, requestKey).stream().findFirst();
    }

    List<SaleLine> lines(UUID saleId) {
        return jdbc.query("""
            SELECT l.id, l.sale_id, l.category_code, c.display_name AS category_name,
                   l.length_cm, l.agreed_weight, l.final_weight, l.price_per_gram,
                   COALESCE(d.delivered_weight, 0) AS delivered_weight,
                   COALESCE(d.delivered_final_weight, 0) AS delivered_final_weight
            FROM sale_line l
            JOIN hair_category c ON c.code = l.category_code
            LEFT JOIN (
                SELECT dl.sale_line_id, SUM(dl.weight) AS delivered_weight,
                       SUM(dl.final_weight) AS delivered_final_weight
                FROM sale_delivery_line dl JOIN sale_delivery sd ON sd.id = dl.delivery_id
                WHERE sd.voided_at IS NULL GROUP BY dl.sale_line_id
            ) d ON d.sale_line_id = l.id
            WHERE l.sale_id = ?
            ORDER BY l.category_code, l.length_cm, l.id
            """, (row, number) -> new SaleLine(
                (UUID) row.getObject("id"), (UUID) row.getObject("sale_id"),
                row.getString("category_code"), row.getString("category_name"),
                row.getInt("length_cm"), row.getBigDecimal("agreed_weight"),
                row.getBigDecimal("final_weight"), row.getBigDecimal("price_per_gram"),
                row.getBigDecimal("delivered_weight"), row.getBigDecimal("delivered_final_weight")
            ), saleId);
    }

    Optional<Delivery> findDeliveryByRequestKey(UUID requestKey) {
        return jdbc.query("SELECT * FROM sale_delivery WHERE request_key = ?",
            SaleRepository::mapDelivery, requestKey).stream().findFirst();
    }

    Optional<Delivery> findDeliveryById(UUID deliveryId) {
        return jdbc.query("SELECT * FROM sale_delivery WHERE id = ?",
            SaleRepository::mapDelivery, deliveryId).stream().findFirst();
    }

    List<Delivery> deliveries(UUID saleId) {
        return jdbc.query("""
            SELECT * FROM sale_delivery WHERE sale_id = ?
            ORDER BY effective_at, recorded_at, id
            """, SaleRepository::mapDelivery, saleId);
    }

    List<DeliveryItem> deliveryItems(UUID deliveryId) {
        return jdbc.query("""
            SELECT dl.id, dl.sale_line_id, dl.weight, dl.final_weight
            FROM sale_delivery_line dl WHERE dl.delivery_id = ? ORDER BY dl.id
            """, (row, number) -> new DeliveryItem((UUID) row.getObject("id"),
                (UUID) row.getObject("sale_line_id"), row.getBigDecimal("weight"),
                row.getBigDecimal("final_weight")), deliveryId);
    }

    List<Consumption> consumptions(UUID deliveryLineId) {
        return jdbc.query("""
            SELECT sc.stock_lot_id, sc.weight, sl.cost_per_gram,
                   sl.effective_at AS received_at, p.id AS purchase_id,
                   s.name AS supplier_name
            FROM stock_consumption sc
            JOIN stock_lot sl ON sl.id = sc.stock_lot_id
            LEFT JOIN purchase_receipt_line rl ON rl.id = sl.receipt_line_id
            LEFT JOIN purchase_receipt pr ON pr.id = rl.receipt_id
            LEFT JOIN purchase_order p ON p.id = pr.purchase_id
            LEFT JOIN supplier s ON s.id = p.supplier_id
            WHERE sc.delivery_line_id = ?
            ORDER BY sl.effective_at, sl.opening_order NULLS LAST, sl.created_at, sl.id
            """, (row, number) -> new Consumption(
                (UUID) row.getObject("stock_lot_id"), row.getBigDecimal("weight"),
                row.getBigDecimal("cost_per_gram"), row.getTimestamp("received_at").toInstant(),
                (UUID) row.getObject("purchase_id"),
                row.getString("supplier_name") == null ? "Inventario inicial"
                    : row.getString("supplier_name")
            ), deliveryLineId);
    }

    List<History> history(UUID saleId) {
        return jdbc.query("""
            SELECT id, changed_at, event_type, actor_user_id, reason,
                   old_values::text AS old_values_json, new_values::text AS new_values_json
            FROM sale_history WHERE sale_id = ? ORDER BY changed_at DESC, id DESC
            """, (row, number) -> new History(
                row.getLong("id"), row.getTimestamp("changed_at").toInstant(),
                row.getString("event_type"), (UUID) row.getObject("actor_user_id"),
                row.getString("reason"), row.getString("old_values_json"),
                row.getString("new_values_json")
            ), saleId);
    }

    void create(UUID id, UUID requestKey, String requestHash, String customerName,
                LocalDate operationDate, boolean acceptedPendingStock) {
        jdbc.update("""
            INSERT INTO sale_order
                (id, request_key, request_hash, customer_name, operation_date, accepted_pending_stock)
            VALUES (?, ?, ?, ?, ?, ?)
            """, id, requestKey, requestHash, customerName, operationDate, acceptedPendingStock);
    }

    void addLine(UUID id, UUID saleId, String categoryCode, int lengthCm,
                 BigDecimal weight, BigDecimal finalWeight, BigDecimal pricePerGram) {
        jdbc.update("""
            INSERT INTO sale_line
                (id, sale_id, category_code, length_cm, agreed_weight, final_weight, price_per_gram)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, id, saleId, categoryCode, lengthCm, weight, finalWeight, pricePerGram);
    }

    void updateHeader(UUID saleId, String customerName, LocalDate operationDate,
                      boolean acceptedPendingStock) {
        jdbc.update("""
            UPDATE sale_order SET customer_name = ?, operation_date = ?,
                accepted_pending_stock = ? WHERE id = ?
            """, customerName, operationDate, acceptedPendingStock, saleId);
    }

    void updateLine(UUID id, String categoryCode, int lengthCm,
                    BigDecimal weight, BigDecimal finalWeight, BigDecimal pricePerGram) {
        jdbc.update("""
            UPDATE sale_line SET category_code = ?, length_cm = ?,
                agreed_weight = ?, final_weight = ?, price_per_gram = ? WHERE id = ?
            """, categoryCode, lengthCm, weight, finalWeight, pricePerGram, id);
    }

    void deleteLine(UUID id) {
        jdbc.update("DELETE FROM sale_line WHERE id = ?", id);
    }

    void touch(UUID saleId) {
        jdbc.update("""
            UPDATE sale_order SET updated_at = now(), version = version + 1 WHERE id = ?
            """, saleId);
    }

    void confirm(UUID saleId) {
        jdbc.update("""
            UPDATE sale_order SET status = 'CONFIRMED', confirmed_at = now(),
                updated_at = now(), version = version + 1
            WHERE id = ? AND status = 'PENDING'
            """, saleId);
    }

    void addDelivery(UUID id, UUID saleId, UUID requestKey,
                     String requestHash, Instant effectiveAt) {
        jdbc.update("""
            INSERT INTO sale_delivery (id, sale_id, request_key, request_hash, effective_at)
            VALUES (?, ?, ?, ?, ?)
            """, id, saleId, requestKey, requestHash, effectiveAt);
    }

    void addDeliveryLine(UUID id, UUID deliveryId, UUID saleId,
                         UUID saleLineId, BigDecimal weight, BigDecimal finalWeight) {
        jdbc.update("""
            INSERT INTO sale_delivery_line (id, delivery_id, sale_id, sale_line_id, weight, final_weight)
            VALUES (?, ?, ?, ?, ?, ?)
            """, id, deliveryId, saleId, saleLineId, weight, finalWeight);
    }

    void updateDeliveryTime(UUID deliveryId, Instant effectiveAt) {
        jdbc.update("UPDATE sale_delivery SET effective_at = ? WHERE id = ?",
            effectiveAt, deliveryId);
    }

    void updateDeliveryItem(UUID deliveryLineId, BigDecimal weight, BigDecimal finalWeight) {
        jdbc.update("UPDATE sale_delivery_line SET weight = ?, final_weight = ? WHERE id = ?",
            weight, finalWeight, deliveryLineId);
    }

    void voidDelivery(UUID deliveryId) {
        jdbc.update("UPDATE sale_delivery SET voided_at = now() WHERE id = ? AND voided_at IS NULL",
            deliveryId);
    }

    void reconcileStatusAfterDeliveryChange(UUID saleId, boolean completed) {
        jdbc.update("""
            UPDATE sale_order SET
                status = CASE WHEN status = 'CANCELED' THEN 'CANCELED'
                              WHEN ? THEN 'CONFIRMED' ELSE 'PENDING' END,
                confirmed_at = CASE WHEN status = 'CANCELED' THEN confirmed_at
                                    WHEN ? AND status = 'CONFIRMED' THEN confirmed_at
                                    WHEN ? THEN now() ELSE NULL END,
                updated_at = now(), version = version + 1
            WHERE id = ?
            """, completed, completed, completed, saleId);
    }

    void cancel(UUID saleId) {
        jdbc.update("""
            UPDATE sale_order SET status = 'CANCELED', canceled_at = now(),
                updated_at = now(), version = version + 1
            WHERE id = ? AND status = 'PENDING'
            """, saleId);
    }

    void addHistory(UUID saleId, String eventType, UUID actorId, String reason,
                    String oldValuesJson, String newValuesJson) {
        jdbc.update("""
            INSERT INTO sale_history
                (sale_id, event_type, actor_user_id, reason, old_values, new_values)
            VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb)
            """, saleId, eventType, actorId, reason, oldValuesJson, newValuesJson);
    }

    private static Sale mapSale(ResultSet row, int number) throws SQLException {
        var confirmed = row.getTimestamp("confirmed_at");
        var canceled = row.getTimestamp("canceled_at");
        return new Sale(
            (UUID) row.getObject("id"), (UUID) row.getObject("request_key"),
            row.getString("request_hash"), row.getString("customer_name"),
            row.getObject("operation_date", LocalDate.class),
            row.getBoolean("accepted_pending_stock"), row.getString("status"),
            row.getTimestamp("created_at").toInstant(),
            confirmed == null ? null : confirmed.toInstant(),
            canceled == null ? null : canceled.toInstant(),
            row.getTimestamp("updated_at").toInstant(), row.getLong("version")
        );
    }

    private static Delivery mapDelivery(ResultSet row, int number) throws SQLException {
        var voided = row.getTimestamp("voided_at");
        return new Delivery((UUID) row.getObject("id"), (UUID) row.getObject("sale_id"),
            (UUID) row.getObject("request_key"), row.getString("request_hash"),
            row.getTimestamp("effective_at").toInstant(),
            row.getTimestamp("recorded_at").toInstant(),
            voided == null ? null : voided.toInstant());
    }

    record Sale(UUID id, UUID requestKey, String requestHash, String customerName,
                LocalDate operationDate, boolean acceptedPendingStock, String status,
                Instant createdAt, Instant confirmedAt, Instant canceledAt,
                Instant updatedAt, long version) {}

    record SaleLine(UUID id, UUID saleId, String categoryCode, String categoryName,
                    int lengthCm, BigDecimal agreedWeight, BigDecimal finalWeight,
                    BigDecimal pricePerGram, BigDecimal deliveredWeight,
                    BigDecimal deliveredFinalWeight) {}

    record Delivery(UUID id, UUID saleId, UUID requestKey, String requestHash,
                    Instant effectiveAt, Instant recordedAt, Instant voidedAt) {}
    record DeliveryItem(UUID id, UUID saleLineId, BigDecimal weight, BigDecimal finalWeight) {}
    record Consumption(UUID stockLotId, BigDecimal weight, BigDecimal costPerGram,
                       Instant receivedAt, UUID purchaseId, String supplierName) {}

    record History(long id, Instant changedAt, String eventType, UUID actorUserId,
                   String reason, String oldValuesJson, String newValuesJson) {}
}
