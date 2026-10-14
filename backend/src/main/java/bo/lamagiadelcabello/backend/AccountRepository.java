package bo.lamagiadelcabello.backend;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class AccountRepository {

    private static final String ACCOUNT_COLUMNS = """
        id, username, password_hash, role, full_name, active,
        must_change_password, failed_login_count, next_login_at, session_version
        """;

    private final JdbcTemplate jdbc;

    AccountRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    Optional<Account> findByNormalizedUsernameForUpdate(String normalized) {
        List<Account> accounts = jdbc.query(
            "SELECT " + ACCOUNT_COLUMNS + " FROM app_user WHERE username_normalized = ? FOR UPDATE",
            AccountRepository::mapAccount,
            normalized
        );
        return accounts.stream().findFirst();
    }

    Optional<Account> findById(UUID id) {
        List<Account> accounts = jdbc.query(
            "SELECT " + ACCOUNT_COLUMNS + " FROM app_user WHERE id = ?",
            AccountRepository::mapAccount,
            id
        );
        return accounts.stream().findFirst();
    }

    Optional<Account> findByIdForUpdate(UUID id) {
        List<Account> accounts = jdbc.query(
            "SELECT " + ACCOUNT_COLUMNS + " FROM app_user WHERE id = ? FOR UPDATE",
            AccountRepository::mapAccount,
            id
        );
        return accounts.stream().findFirst();
    }

    void recordFailedLogin(UUID id, int failures, Instant nextLoginAt) {
        jdbc.update(
            "UPDATE app_user SET failed_login_count = ?, next_login_at = ? WHERE id = ?",
            failures,
            nextLoginAt == null ? null : Timestamp.from(nextLoginAt),
            id
        );
    }

    void recordSuccessfulLogin(UUID id) {
        jdbc.update("""
            UPDATE app_user
            SET failed_login_count = 0, next_login_at = NULL, last_login_at = now()
            WHERE id = ?
            """, id);
    }

    long changePassword(UUID id, String hash) {
        Long newVersion = jdbc.queryForObject("""
            UPDATE app_user
            SET password_hash = ?, must_change_password = FALSE,
                password_changed_at = now(), updated_at = now(),
                failed_login_count = 0, next_login_at = NULL,
                session_version = session_version + 1
            WHERE id = ?
            RETURNING session_version
            """, Long.class, hash, id);
        jdbc.update("""
            INSERT INTO app_user_history (user_id, event_type, source, actor_user_id)
            VALUES (?, 'PASSWORD_CHANGED', 'SELF_SERVICE', ?)
            """, id, id);
        if (newVersion == null) throw new IllegalStateException("No se pudo actualizar la versión de acceso.");
        return newVersion;
    }

    void closeOtherSessions(UUID id, String currentSessionId) {
        jdbc.update(
            "DELETE FROM spring_session WHERE principal_name = ? AND session_id <> ?",
            id.toString(), currentSessionId
        );
    }

    private static Account mapAccount(ResultSet row, int number) throws SQLException {
        Timestamp nextLogin = row.getTimestamp("next_login_at");
        return new Account(
            (UUID) row.getObject("id"),
            row.getString("username"),
            row.getString("password_hash"),
            row.getString("role"),
            row.getString("full_name"),
            row.getBoolean("active"),
            row.getBoolean("must_change_password"),
            row.getInt("failed_login_count"),
            nextLogin == null ? null : nextLogin.toInstant(),
            row.getLong("session_version")
        );
    }

    record Account(
        UUID id,
        String username,
        String passwordHash,
        String role,
        String fullName,
        boolean active,
        boolean mustChangePassword,
        int failedLoginCount,
        Instant nextLoginAt,
        long sessionVersion
    ) {
        String displayName() {
            return fullName == null || fullName.isBlank() ? username : fullName;
        }
    }
}
