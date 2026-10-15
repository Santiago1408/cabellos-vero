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
                   l.length_cm, l.agreed_weight, l.price_per_gram
            FROM sale_line l
            JOIN hair_category c ON c.code = l.category_code
            WHERE l.sale_id = ?
            ORDER BY l.category_code, l.length_cm, l.id
            """, (row, number) -> new SaleLine(
                (UUID) row.getObject("id"), (UUID) row.getObject("sale_id"),
                row.getString("category_code"), row.getString("category_name"),
                row.getInt("length_cm"), row.getBigDecimal("agreed_weight"),
                row.getBigDecimal("price_per_gram")
            ), saleId);
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
                 BigDecimal weight, BigDecimal pricePerGram) {
        jdbc.update("""
            INSERT INTO sale_line
                (id, sale_id, category_code, length_cm, agreed_weight, price_per_gram)
            VALUES (?, ?, ?, ?, ?, ?)
            """, id, saleId, categoryCode, lengthCm, weight, pricePerGram);
    }

    void updateHeader(UUID saleId, String customerName, LocalDate operationDate,
                      boolean acceptedPendingStock) {
        jdbc.update("""
            UPDATE sale_order SET customer_name = ?, operation_date = ?,
                accepted_pending_stock = ? WHERE id = ?
            """, customerName, operationDate, acceptedPendingStock, saleId);
    }

    void updateLine(UUID id, String categoryCode, int lengthCm,
                    BigDecimal weight, BigDecimal pricePerGram) {
        jdbc.update("""
            UPDATE sale_line SET category_code = ?, length_cm = ?,
                agreed_weight = ?, price_per_gram = ? WHERE id = ?
            """, categoryCode, lengthCm, weight, pricePerGram, id);
    }

    void deleteLine(UUID id) {
        jdbc.update("DELETE FROM sale_line WHERE id = ?", id);
    }

    void touch(UUID saleId) {
        jdbc.update("""
            UPDATE sale_order SET updated_at = now(), version = version + 1 WHERE id = ?
            """, saleId);
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

    record Sale(UUID id, UUID requestKey, String requestHash, String customerName,
                LocalDate operationDate, boolean acceptedPendingStock, String status,
                Instant createdAt, Instant confirmedAt, Instant canceledAt,
                Instant updatedAt, long version) {}

    record SaleLine(UUID id, UUID saleId, String categoryCode, String categoryName,
                    int lengthCm, BigDecimal agreedWeight, BigDecimal pricePerGram) {}

    record History(long id, Instant changedAt, String eventType, UUID actorUserId,
                   String reason, String oldValuesJson, String newValuesJson) {}
}
