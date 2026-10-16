package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class PurchaseRepository {

    private static final String PURCHASE_COLUMNS = """
        p.id, p.request_key, p.request_hash, p.supplier_id, s.name AS supplier_name,
        p.operation_date, p.status, p.created_at, p.confirmed_at, p.canceled_at,
        p.updated_at, p.version
        """;

    private final JdbcTemplate jdbc;

    PurchaseRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<Purchase> list() {
        return jdbc.query("SELECT " + PURCHASE_COLUMNS + " FROM purchase_order p "
            + "JOIN supplier s ON s.id = p.supplier_id "
            + "ORDER BY p.operation_date DESC, p.created_at DESC, p.id DESC",
            PurchaseRepository::mapPurchase);
    }

    Optional<Purchase> findById(UUID id) {
        return jdbc.query("SELECT " + PURCHASE_COLUMNS + " FROM purchase_order p "
            + "JOIN supplier s ON s.id = p.supplier_id WHERE p.id = ?",
            PurchaseRepository::mapPurchase, id).stream().findFirst();
    }

    Optional<Purchase> findByIdForUpdate(UUID id) {
        return jdbc.query("SELECT " + PURCHASE_COLUMNS + " FROM purchase_order p "
            + "JOIN supplier s ON s.id = p.supplier_id WHERE p.id = ? FOR UPDATE OF p",
            PurchaseRepository::mapPurchase, id).stream().findFirst();
    }

    Optional<Purchase> findByRequestKey(UUID requestKey) {
        return jdbc.query("SELECT " + PURCHASE_COLUMNS + " FROM purchase_order p "
            + "JOIN supplier s ON s.id = p.supplier_id WHERE p.request_key = ?",
            PurchaseRepository::mapPurchase, requestKey).stream().findFirst();
    }

    Optional<Receipt> findReceiptByRequestKey(UUID requestKey) {
        return jdbc.query("""
            SELECT id, purchase_id, request_key, request_hash, effective_at, recorded_at, voided_at
            FROM purchase_receipt WHERE request_key = ?
            """, PurchaseRepository::mapReceipt, requestKey).stream().findFirst();
    }

    Optional<Receipt> findReceiptById(UUID receiptId) {
        return jdbc.query("""
            SELECT id, purchase_id, request_key, request_hash, effective_at, recorded_at, voided_at
            FROM purchase_receipt WHERE id = ?
            """, PurchaseRepository::mapReceipt, receiptId).stream().findFirst();
    }

    List<PurchaseLine> lines(UUID purchaseId) {
        return jdbc.query("""
            SELECT l.id, l.purchase_id, l.category_code, c.display_name AS category_name,
                   l.length_cm, l.agreed_weight, l.price_per_gram,
                   COALESCE(SUM(CASE WHEN r.voided_at IS NULL THEN rl.weight ELSE 0 END), 0)
                       AS received_weight
            FROM purchase_line l
            JOIN hair_category c ON c.code = l.category_code
            LEFT JOIN purchase_receipt_line rl ON rl.purchase_line_id = l.id
            LEFT JOIN purchase_receipt r ON r.id = rl.receipt_id
            WHERE l.purchase_id = ?
            GROUP BY l.id, c.display_name
            ORDER BY l.category_code, l.length_cm, l.id
            """, (row, number) -> new PurchaseLine(
                (UUID) row.getObject("id"), (UUID) row.getObject("purchase_id"),
                row.getString("category_code"), row.getString("category_name"),
                row.getInt("length_cm"), row.getBigDecimal("agreed_weight"),
                row.getBigDecimal("price_per_gram"), row.getBigDecimal("received_weight")
            ), purchaseId);
    }

    List<Receipt> receipts(UUID purchaseId) {
        return jdbc.query("""
            SELECT id, purchase_id, request_key, request_hash, effective_at, recorded_at, voided_at
            FROM purchase_receipt WHERE purchase_id = ? ORDER BY effective_at, id
            """, PurchaseRepository::mapReceipt, purchaseId);
    }

    List<ReceiptItem> receiptItems(UUID receiptId) {
        return jdbc.query("""
            SELECT id, purchase_line_id, weight FROM purchase_receipt_line
            WHERE receipt_id = ? ORDER BY purchase_line_id
            """, (row, number) -> new ReceiptItem(
                (UUID) row.getObject("id"), (UUID) row.getObject("purchase_line_id"),
                row.getBigDecimal("weight")
            ), receiptId);
    }

    List<StockLot> stockLotsForReceiptForUpdate(UUID receiptId) {
        return jdbc.query("""
            SELECT sl.id, sl.receipt_line_id, rl.purchase_line_id, sl.original_weight,
                   sl.remaining_weight, sl.effective_at, sl.voided_at
            FROM stock_lot sl
            JOIN purchase_receipt_line rl ON rl.id = sl.receipt_line_id
            WHERE rl.receipt_id = ?
            ORDER BY sl.id FOR UPDATE OF sl
            """, (row, number) -> {
                var voided = row.getTimestamp("voided_at");
                return new StockLot(
                    (UUID) row.getObject("id"), (UUID) row.getObject("receipt_line_id"),
                    (UUID) row.getObject("purchase_line_id"),
                    row.getBigDecimal("original_weight"), row.getBigDecimal("remaining_weight"),
                    row.getTimestamp("effective_at").toInstant(),
                    voided == null ? null : voided.toInstant()
                );
            }, receiptId);
    }

    List<History> history(UUID purchaseId) {
        return jdbc.query("""
            SELECT id, changed_at, event_type, actor_user_id, reason,
                   old_values::text AS old_values_json, new_values::text AS new_values_json
            FROM purchase_history WHERE purchase_id = ? ORDER BY changed_at DESC, id DESC
            """, (row, number) -> new History(
                row.getLong("id"), row.getTimestamp("changed_at").toInstant(),
                row.getString("event_type"), (UUID) row.getObject("actor_user_id"),
                row.getString("reason"), row.getString("old_values_json"),
                row.getString("new_values_json")
            ), purchaseId);
    }

    void create(UUID id, UUID requestKey, String requestHash, UUID supplierId, LocalDate operationDate) {
        jdbc.update("""
            INSERT INTO purchase_order
                (id, request_key, request_hash, supplier_id, operation_date)
            VALUES (?, ?, ?, ?, ?)
            """, id, requestKey, requestHash, supplierId, operationDate);
    }

    void addLine(UUID id, UUID purchaseId, String categoryCode, int lengthCm,
                 BigDecimal agreedWeight, BigDecimal pricePerGram) {
        jdbc.update("""
            INSERT INTO purchase_line
                (id, purchase_id, category_code, length_cm, agreed_weight, price_per_gram)
            VALUES (?, ?, ?, ?, ?, ?)
            """, id, purchaseId, categoryCode, lengthCm, agreedWeight, pricePerGram);
    }

    void updateHeader(UUID purchaseId, UUID supplierId, LocalDate operationDate) {
        jdbc.update("""
            UPDATE purchase_order SET supplier_id = ?, operation_date = ? WHERE id = ?
            """, supplierId, operationDate, purchaseId);
    }

    void updateLine(UUID id, String categoryCode, int lengthCm,
                    BigDecimal agreedWeight, BigDecimal pricePerGram) {
        jdbc.update("""
            UPDATE purchase_line SET category_code = ?, length_cm = ?,
                agreed_weight = ?, price_per_gram = ? WHERE id = ?
            """, categoryCode, lengthCm, agreedWeight, pricePerGram, id);
    }

    void deleteLine(UUID id) {
        jdbc.update("DELETE FROM purchase_line WHERE id = ?", id);
    }

    void updateLotCost(UUID purchaseLineId, BigDecimal pricePerGram) {
        jdbc.update("""
            UPDATE stock_lot SET cost_per_gram = ?
            WHERE receipt_line_id IN (
                SELECT id FROM purchase_receipt_line WHERE purchase_line_id = ?
            )
            """, pricePerGram, purchaseLineId);
    }

    void addReceipt(UUID id, UUID purchaseId, UUID requestKey, String requestHash, Instant effectiveAt) {
        jdbc.update("""
            INSERT INTO purchase_receipt (id, purchase_id, request_key, request_hash, effective_at)
            VALUES (?, ?, ?, ?, ?)
            """, id, purchaseId, requestKey, requestHash, Timestamp.from(effectiveAt));
    }

    void addReceiptLine(UUID id, UUID receiptId, UUID purchaseId, UUID purchaseLineId,
                        BigDecimal weight) {
        jdbc.update("""
            INSERT INTO purchase_receipt_line
                (id, receipt_id, purchase_id, purchase_line_id, weight)
            VALUES (?, ?, ?, ?, ?)
            """, id, receiptId, purchaseId, purchaseLineId, weight);
    }

    void addStockLot(UUID id, UUID receiptLineId, String categoryCode, int lengthCm,
                     BigDecimal costPerGram, BigDecimal weight, Instant effectiveAt) {
        jdbc.update("""
            INSERT INTO stock_lot
                (id, receipt_line_id, category_code, length_cm, cost_per_gram,
                 original_weight, remaining_weight, effective_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, id, receiptLineId, categoryCode, lengthCm, costPerGram,
            weight, weight, Timestamp.from(effectiveAt));
    }

    void updateReceiptTime(UUID receiptId, Instant effectiveAt) {
        jdbc.update("UPDATE purchase_receipt SET effective_at = ? WHERE id = ?",
            Timestamp.from(effectiveAt), receiptId);
        jdbc.update("""
            UPDATE stock_lot SET effective_at = ?
            WHERE receipt_line_id IN (SELECT id FROM purchase_receipt_line WHERE receipt_id = ?)
            """, Timestamp.from(effectiveAt), receiptId);
    }

    void updateReceiptItem(UUID receiptLineId, BigDecimal weight) {
        jdbc.update("UPDATE purchase_receipt_line SET weight = ? WHERE id = ?", weight, receiptLineId);
    }

    void updateStockLotWeight(UUID lotId, BigDecimal originalWeight, BigDecimal remainingWeight) {
        jdbc.update("""
            UPDATE stock_lot SET original_weight = ?, remaining_weight = ? WHERE id = ?
            """, originalWeight, remainingWeight, lotId);
    }

    void voidReceipt(UUID receiptId) {
        jdbc.update("UPDATE purchase_receipt SET voided_at = now() WHERE id = ?", receiptId);
        jdbc.update("""
            UPDATE stock_lot SET voided_at = now()
            WHERE receipt_line_id IN (SELECT id FROM purchase_receipt_line WHERE receipt_id = ?)
            """, receiptId);
    }

    void reconcileStatusAfterReceiptChange(UUID purchaseId, boolean completed) {
        jdbc.update("""
            UPDATE purchase_order SET
                status = CASE WHEN status = 'CANCELED' THEN 'CANCELED'
                              WHEN ? THEN 'CONFIRMED' ELSE 'PENDING' END,
                confirmed_at = CASE WHEN status = 'CANCELED' THEN confirmed_at
                                    WHEN ? AND status = 'CONFIRMED' THEN confirmed_at
                                    WHEN ? THEN now() ELSE NULL END,
                updated_at = now(), version = version + 1
            WHERE id = ?
            """, completed, completed, completed, purchaseId);
    }

    void confirm(UUID purchaseId) {
        jdbc.update("""
            UPDATE purchase_order SET status = 'CONFIRMED', confirmed_at = now(),
                updated_at = now(), version = version + 1
            WHERE id = ? AND status = 'PENDING'
            """, purchaseId);
    }

    void cancel(UUID purchaseId) {
        jdbc.update("""
            UPDATE purchase_order SET status = 'CANCELED', canceled_at = now(),
                updated_at = now(), version = version + 1
            WHERE id = ? AND status = 'PENDING'
            """, purchaseId);
    }

    void touch(UUID purchaseId) {
        jdbc.update("""
            UPDATE purchase_order SET updated_at = now(), version = version + 1 WHERE id = ?
            """, purchaseId);
    }

    void addHistory(UUID purchaseId, String eventType, UUID actorId, String reason,
                    String oldValuesJson, String newValuesJson) {
        jdbc.update("""
            INSERT INTO purchase_history
                (purchase_id, event_type, actor_user_id, reason, old_values, new_values)
            VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb)
            """, purchaseId, eventType, actorId, reason, oldValuesJson, newValuesJson);
    }

    private static Purchase mapPurchase(ResultSet row, int number) throws SQLException {
        var confirmed = row.getTimestamp("confirmed_at");
        var canceled = row.getTimestamp("canceled_at");
        return new Purchase(
            (UUID) row.getObject("id"), (UUID) row.getObject("request_key"),
            row.getString("request_hash"), (UUID) row.getObject("supplier_id"),
            row.getString("supplier_name"), row.getObject("operation_date", LocalDate.class),
            row.getString("status"), row.getTimestamp("created_at").toInstant(),
            confirmed == null ? null : confirmed.toInstant(),
            canceled == null ? null : canceled.toInstant(),
            row.getTimestamp("updated_at").toInstant(), row.getLong("version")
        );
    }

    private static Receipt mapReceipt(ResultSet row, int number) throws SQLException {
        var voided = row.getTimestamp("voided_at");
        return new Receipt(
            (UUID) row.getObject("id"), (UUID) row.getObject("purchase_id"),
            (UUID) row.getObject("request_key"), row.getString("request_hash"),
            row.getTimestamp("effective_at").toInstant(), row.getTimestamp("recorded_at").toInstant(),
            voided == null ? null : voided.toInstant()
        );
    }

    record Purchase(UUID id, UUID requestKey, String requestHash, UUID supplierId,
                    String supplierName, LocalDate operationDate, String status,
                    Instant createdAt, Instant confirmedAt, Instant canceledAt,
                    Instant updatedAt, long version) {}

    record PurchaseLine(UUID id, UUID purchaseId, String categoryCode, String categoryName,
                        int lengthCm, BigDecimal agreedWeight, BigDecimal pricePerGram,
                        BigDecimal receivedWeight) {}

    record Receipt(UUID id, UUID purchaseId, UUID requestKey, String requestHash,
                   Instant effectiveAt, Instant recordedAt, Instant voidedAt) {}

    record ReceiptItem(UUID id, UUID purchaseLineId, BigDecimal weight) {}

    record StockLot(UUID id, UUID receiptLineId, UUID purchaseLineId,
                    BigDecimal originalWeight, BigDecimal remainingWeight,
                    Instant effectiveAt, Instant voidedAt) {}

    record History(long id, Instant changedAt, String eventType, UUID actorUserId,
                   String reason, String oldValuesJson, String newValuesJson) {}
}
