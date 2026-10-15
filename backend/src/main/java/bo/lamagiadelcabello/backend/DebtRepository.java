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
class DebtRepository {

    private static final String DEBT_COLUMNS = "id, request_key, request_hash, party, phone, kind, "
        + "total, opened_on, due_on, notes, created_at, updated_at, version";
    private static final String PAYMENT_COLUMNS = "id, debt_id, request_key, request_hash, paid_on, "
        + "amount, note, recorded_at, updated_at, voided_at";

    private final JdbcTemplate jdbc;

    DebtRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    List<Debt> list() {
        return jdbc.query("SELECT " + DEBT_COLUMNS + " FROM cash_debt ORDER BY opened_on DESC, created_at DESC, id DESC",
            DebtRepository::mapDebt);
    }

    Optional<Debt> debt(UUID id) {
        return jdbc.query("SELECT " + DEBT_COLUMNS + " FROM cash_debt WHERE id = ?",
            DebtRepository::mapDebt, id).stream().findFirst();
    }

    Optional<Debt> lockedDebt(UUID id) {
        return jdbc.query("SELECT " + DEBT_COLUMNS + " FROM cash_debt WHERE id = ? FOR UPDATE",
            DebtRepository::mapDebt, id).stream().findFirst();
    }

    Optional<Debt> debtByRequestKey(UUID key) {
        return jdbc.query("SELECT " + DEBT_COLUMNS + " FROM cash_debt WHERE request_key = ?",
            DebtRepository::mapDebt, key).stream().findFirst();
    }

    void createDebt(UUID id, UUID key, String hash, DebtData data) {
        jdbc.update("""
            INSERT INTO cash_debt (id, request_key, request_hash, party, phone, kind,
                total, opened_on, due_on, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, id, key, hash, data.party(), data.phone(), data.kind(), data.total(),
            data.openedOn(), data.dueOn(), data.notes());
    }

    void updateDebt(UUID id, DebtData data) {
        jdbc.update("""
            UPDATE cash_debt SET party = ?, phone = ?, kind = ?, total = ?, opened_on = ?,
                due_on = ?, notes = ?, updated_at = now(), version = version + 1
            WHERE id = ?
            """, data.party(), data.phone(), data.kind(), data.total(), data.openedOn(),
            data.dueOn(), data.notes(), id);
    }

    void touch(UUID id) {
        jdbc.update("UPDATE cash_debt SET updated_at = now(), version = version + 1 WHERE id = ?", id);
    }

    List<Payment> payments(UUID debtId) {
        return jdbc.query("SELECT " + PAYMENT_COLUMNS + " FROM cash_debt_payment "
            + "WHERE debt_id = ? ORDER BY paid_on DESC, recorded_at DESC, id DESC",
            DebtRepository::mapPayment, debtId);
    }

    Optional<Payment> payment(UUID id) {
        return jdbc.query("SELECT " + PAYMENT_COLUMNS + " FROM cash_debt_payment WHERE id = ?",
            DebtRepository::mapPayment, id).stream().findFirst();
    }

    Optional<Payment> paymentByRequestKey(UUID key) {
        return jdbc.query("SELECT " + PAYMENT_COLUMNS + " FROM cash_debt_payment WHERE request_key = ?",
            DebtRepository::mapPayment, key).stream().findFirst();
    }

    BigDecimal paid(UUID debtId) {
        BigDecimal value = jdbc.queryForObject("""
            SELECT COALESCE(SUM(amount), 0) FROM cash_debt_payment
            WHERE debt_id = ? AND voided_at IS NULL
            """, BigDecimal.class, debtId);
        return value == null ? BigDecimal.ZERO.setScale(2) : value.setScale(2);
    }

    boolean paymentBefore(UUID debtId, LocalDate openedOn) {
        Boolean value = jdbc.queryForObject("""
            SELECT EXISTS (SELECT 1 FROM cash_debt_payment WHERE debt_id = ? AND paid_on < ?)
            """, Boolean.class, debtId, openedOn);
        return Boolean.TRUE.equals(value);
    }

    void createPayment(UUID id, UUID debtId, UUID key, String hash, PaymentData data) {
        jdbc.update("""
            INSERT INTO cash_debt_payment (id, debt_id, request_key, request_hash, paid_on, amount, note)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, id, debtId, key, hash, data.paidOn(), data.amount(), data.note());
    }

    void updatePayment(UUID id, PaymentData data) {
        jdbc.update("""
            UPDATE cash_debt_payment SET paid_on = ?, amount = ?, note = ?, updated_at = now()
            WHERE id = ? AND voided_at IS NULL
            """, data.paidOn(), data.amount(), data.note(), id);
    }

    void voidPayment(UUID id) {
        jdbc.update("""
            UPDATE cash_debt_payment SET voided_at = now(), updated_at = now()
            WHERE id = ? AND voided_at IS NULL
            """, id);
    }

    void addHistory(UUID debtId, UUID paymentId, String eventType, UUID actorId,
                    String reason, String oldJson, String newJson) {
        jdbc.update("""
            INSERT INTO cash_debt_history
                (debt_id, payment_id, event_type, actor_user_id, reason, old_values, new_values)
            VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb)
            """, debtId, paymentId, eventType, actorId, reason, oldJson, newJson);
    }

    List<History> history(UUID debtId) {
        return jdbc.query("""
            SELECT id, debt_id, payment_id, changed_at, event_type, actor_user_id, reason,
                old_values::text AS old_json, new_values::text AS new_json
            FROM cash_debt_history WHERE debt_id = ? ORDER BY changed_at DESC, id DESC
            """, (row, number) -> new History(row.getLong("id"),
                (UUID) row.getObject("debt_id"), (UUID) row.getObject("payment_id"),
                row.getTimestamp("changed_at").toInstant(), row.getString("event_type"),
                (UUID) row.getObject("actor_user_id"), row.getString("reason"),
                row.getString("old_json"), row.getString("new_json")), debtId);
    }

    private static Debt mapDebt(ResultSet row, int number) throws SQLException {
        return new Debt((UUID) row.getObject("id"), (UUID) row.getObject("request_key"),
            row.getString("request_hash"), row.getString("party"), row.getString("phone"),
            row.getString("kind"), row.getBigDecimal("total"),
            row.getObject("opened_on", LocalDate.class), row.getObject("due_on", LocalDate.class),
            row.getString("notes"), row.getTimestamp("created_at").toInstant(),
            row.getTimestamp("updated_at").toInstant(), row.getLong("version"));
    }

    private static Payment mapPayment(ResultSet row, int number) throws SQLException {
        var voided = row.getTimestamp("voided_at");
        return new Payment((UUID) row.getObject("id"), (UUID) row.getObject("debt_id"),
            (UUID) row.getObject("request_key"), row.getString("request_hash"),
            row.getObject("paid_on", LocalDate.class), row.getBigDecimal("amount"),
            row.getString("note"), row.getTimestamp("recorded_at").toInstant(),
            row.getTimestamp("updated_at").toInstant(), voided == null ? null : voided.toInstant());
    }

    record Debt(UUID id, UUID requestKey, String requestHash, String party, String phone,
                String kind, BigDecimal total, LocalDate openedOn, LocalDate dueOn,
                String notes, Instant createdAt, Instant updatedAt, long version) {}
    record DebtData(String party, String phone, String kind, BigDecimal total,
                    LocalDate openedOn, LocalDate dueOn, String notes) {}
    record Payment(UUID id, UUID debtId, UUID requestKey, String requestHash,
                   LocalDate paidOn, BigDecimal amount, String note, Instant recordedAt,
                   Instant updatedAt, Instant voidedAt) {}
    record PaymentData(LocalDate paidOn, BigDecimal amount, String note) {}
    record History(long id, UUID debtId, UUID paymentId, Instant changedAt,
                   String eventType, UUID actorUserId, String reason,
                   String oldJson, String newJson) {}
}
