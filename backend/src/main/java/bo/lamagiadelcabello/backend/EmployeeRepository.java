package bo.lamagiadelcabello.backend;

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
class EmployeeRepository {

    private static final String COLUMNS = """
        id, username, full_name, ci, birth_date, phone, active,
        must_change_password, created_at, updated_at
        """;

    private final JdbcTemplate jdbc;

    EmployeeRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<Employee> findAll() {
        return jdbc.query(
            "SELECT " + COLUMNS + " FROM app_user WHERE role = 'EMPLOYEE' ORDER BY created_at DESC, id DESC",
            EmployeeRepository::mapEmployee
        );
    }

    Optional<Employee> findById(UUID id) {
        return jdbc.query(
            "SELECT " + COLUMNS + " FROM app_user WHERE id = ? AND role = 'EMPLOYEE'",
            EmployeeRepository::mapEmployee, id
        ).stream().findFirst();
    }

    Optional<Employee> findByIdForUpdate(UUID id) {
        return jdbc.query(
            "SELECT " + COLUMNS + " FROM app_user WHERE id = ? AND role = 'EMPLOYEE' FOR UPDATE",
            EmployeeRepository::mapEmployee, id
        ).stream().findFirst();
    }

    boolean usernameIsUsed(String normalized, UUID exceptId) {
        Integer count = exceptId == null
            ? jdbc.queryForObject("SELECT count(*) FROM app_user WHERE username_normalized = ?", Integer.class, normalized)
            : jdbc.queryForObject("SELECT count(*) FROM app_user WHERE username_normalized = ? AND id <> ?", Integer.class, normalized, exceptId);
        return count != null && count > 0;
    }

    boolean ciIsUsed(String ci, UUID exceptId) {
        Integer count = exceptId == null
            ? jdbc.queryForObject("SELECT count(*) FROM app_user WHERE role = 'EMPLOYEE' AND lower(trim(ci)) = lower(?)", Integer.class, ci)
            : jdbc.queryForObject("SELECT count(*) FROM app_user WHERE role = 'EMPLOYEE' AND lower(trim(ci)) = lower(?) AND id <> ?", Integer.class, ci, exceptId);
        return count != null && count > 0;
    }

    void create(UUID id, String username, String normalized, String passwordHash,
                String fullName, String ci, LocalDate birthDate, String phone) {
        jdbc.update("""
            INSERT INTO app_user
                (id, username, username_normalized, password_hash, role,
                 full_name, ci, birth_date, phone, active, must_change_password)
            VALUES (?, ?, ?, ?, 'EMPLOYEE', ?, ?, ?, ?, TRUE, TRUE)
            """, id, username, normalized, passwordHash, fullName, ci, birthDate, phone);
    }

    void update(UUID id, String username, String normalized,
                String fullName, String ci, LocalDate birthDate, String phone) {
        jdbc.update("""
            UPDATE app_user
            SET username = ?, username_normalized = ?, full_name = ?, ci = ?,
                birth_date = ?, phone = ?, updated_at = now()
            WHERE id = ? AND role = 'EMPLOYEE'
            """, username, normalized, fullName, ci, birthDate, phone, id);
    }

    void setActive(UUID id, boolean active) {
        jdbc.update("""
            UPDATE app_user SET active = ?, updated_at = now(),
                session_version = session_version + 1,
                failed_login_count = 0, next_login_at = NULL
            WHERE id = ? AND role = 'EMPLOYEE'
            """, active, id);
    }

    void resetPassword(UUID id, String hash) {
        jdbc.update("""
            UPDATE app_user SET password_hash = ?, must_change_password = TRUE,
                password_changed_at = now(), updated_at = now(),
                session_version = session_version + 1,
                failed_login_count = 0, next_login_at = NULL
            WHERE id = ? AND role = 'EMPLOYEE'
            """, hash, id);
    }

    void closeAllSessions(UUID id) {
        jdbc.update("DELETE FROM spring_session WHERE principal_name = ?", id.toString());
    }

    void addHistory(UUID employeeId, String eventType, UUID actorId, String reason,
                    String oldValuesJson, String newValuesJson) {
        jdbc.update("""
            INSERT INTO app_user_history
                (user_id, event_type, source, actor_user_id, reason, old_values, new_values)
            VALUES (?, ?, 'ADMIN_PANEL', ?, ?, ?::jsonb, ?::jsonb)
            """, employeeId, eventType, actorId, reason, oldValuesJson, newValuesJson);
    }

    List<History> history(UUID employeeId) {
        return jdbc.query("""
            SELECT id, changed_at, event_type, source, actor_user_id, reason,
                   old_values::text AS old_values_json, new_values::text AS new_values_json
            FROM app_user_history WHERE user_id = ?
            ORDER BY changed_at DESC, id DESC
            """, (row, number) -> new History(
                row.getLong("id"), row.getTimestamp("changed_at").toInstant(),
                row.getString("event_type"), row.getString("source"),
                (UUID) row.getObject("actor_user_id"), row.getString("reason"),
                row.getString("old_values_json"), row.getString("new_values_json")
            ), employeeId);
    }

    private static Employee mapEmployee(ResultSet row, int number) throws SQLException {
        return new Employee(
            (UUID) row.getObject("id"), row.getString("username"), row.getString("full_name"),
            row.getString("ci"), row.getObject("birth_date", LocalDate.class), row.getString("phone"),
            row.getBoolean("active"), row.getBoolean("must_change_password"),
            row.getTimestamp("created_at").toInstant(), row.getTimestamp("updated_at").toInstant()
        );
    }

    record Employee(UUID id, String username, String fullName, String ci, LocalDate birthDate,
                    String phone, boolean active, boolean mustChangePassword,
                    Instant createdAt, Instant updatedAt) {}

    record History(long id, Instant changedAt, String eventType, String source,
                   UUID actorUserId, String reason, String oldValuesJson, String newValuesJson) {}
}
