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
class SalePaymentRepository {

    private static final String COLUMNS = """
        id, sale_id, request_key, request_hash, payment_date, amount,
        method, reference, recorded_at, updated_at, voided_at
        """;

    private final JdbcTemplate jdbc;

    SalePaymentRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<Payment> list(UUID saleId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM sale_payment "
            + "WHERE sale_id = ? ORDER BY payment_date, recorded_at, id",
            SalePaymentRepository::map, saleId);
    }

    Optional<Payment> findById(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM sale_payment WHERE id = ?",
            SalePaymentRepository::map, id).stream().findFirst();
    }

    Optional<Payment> findByRequestKey(UUID requestKey) {
        return jdbc.query("SELECT " + COLUMNS + " FROM sale_payment WHERE request_key = ?",
            SalePaymentRepository::map, requestKey).stream().findFirst();
    }

    BigDecimal totalActive(UUID saleId) {
        BigDecimal amount = jdbc.queryForObject("""
            SELECT COALESCE(SUM(amount), 0) FROM sale_payment
            WHERE sale_id = ? AND voided_at IS NULL
            """, BigDecimal.class, saleId);
        return amount == null ? BigDecimal.ZERO.setScale(2) : amount.setScale(2);
    }

    void create(UUID id, UUID saleId, UUID requestKey, String requestHash,
                LocalDate paymentDate, BigDecimal amount, String method, String reference) {
        jdbc.update("""
            INSERT INTO sale_payment
                (id, sale_id, request_key, request_hash, payment_date, amount, method, reference)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, id, saleId, requestKey, requestHash, paymentDate, amount, method, reference);
    }

    void update(UUID id, LocalDate paymentDate, BigDecimal amount,
                String method, String reference) {
        jdbc.update("""
            UPDATE sale_payment
            SET payment_date = ?, amount = ?, method = ?, reference = ?, updated_at = now()
            WHERE id = ? AND voided_at IS NULL
            """, paymentDate, amount, method, reference, id);
    }

    void voidPayment(UUID id) {
        jdbc.update("""
            UPDATE sale_payment SET voided_at = now(), updated_at = now()
            WHERE id = ? AND voided_at IS NULL
            """, id);
    }

    private static Payment map(ResultSet row, int number) throws SQLException {
        var voided = row.getTimestamp("voided_at");
        return new Payment(
            (UUID) row.getObject("id"), (UUID) row.getObject("sale_id"),
            (UUID) row.getObject("request_key"), row.getString("request_hash"),
            row.getObject("payment_date", LocalDate.class), row.getBigDecimal("amount"),
            row.getString("method"), row.getString("reference"),
            row.getTimestamp("recorded_at").toInstant(),
            row.getTimestamp("updated_at").toInstant(),
            voided == null ? null : voided.toInstant()
        );
    }

    record Payment(UUID id, UUID saleId, UUID requestKey, String requestHash,
                   LocalDate paymentDate, BigDecimal amount, String method,
                   String reference, Instant recordedAt, Instant updatedAt, Instant voidedAt) {}
}
