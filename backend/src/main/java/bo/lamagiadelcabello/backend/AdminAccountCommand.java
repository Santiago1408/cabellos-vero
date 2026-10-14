package bo.lamagiadelcabello.backend;

import java.io.Console;
import java.nio.CharBuffer;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
@ConditionalOnProperty(name = "app.admin-command")
class AdminAccountCommand implements ApplicationRunner {

    private static final Pattern USERNAME = Pattern.compile("[\\p{L}\\p{N}._-]{1,80}");

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final TransactionTemplate transactions;
    private final String action;

    AdminAccountCommand(
        JdbcTemplate jdbc,
        PasswordEncoder passwordEncoder,
        TransactionTemplate transactions,
        @org.springframework.beans.factory.annotation.Value("${app.admin-command}") String action
    ) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.transactions = transactions;
        this.action = action;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        if (!action.equals("create") && !action.equals("recover")) {
            throw new IllegalArgumentException("app.admin-command debe ser create o recover");
        }

        Console console = System.console();
        if (console == null) {
            throw new IllegalStateException("El comando necesita una terminal interactiva con TTY (no uses -T)");
        }

        List<AdminAccount> admins = jdbc.query(
            "SELECT id, username FROM app_user WHERE role = 'ADMIN'",
            (row, number) -> new AdminAccount((UUID) row.getObject("id"), row.getString("username"))
        );
        if (action.equals("create") && !admins.isEmpty()) {
            throw new IllegalStateException("Ya existe un administrador. Usa recover solo para recuperar su acceso.");
        }
        if (action.equals("recover") && admins.isEmpty()) {
            throw new IllegalStateException("Todavía no existe un administrador. Usa create.");
        }

        String username = console.readLine("Usuario del administrador: ");
        if (username == null || !USERNAME.matcher(username.trim()).matches()) {
            throw new IllegalArgumentException("El usuario debe tener 1 a 80 letras, números, puntos, guiones o guiones bajos, sin espacios.");
        }
        username = username.trim();
        String normalized = username.toLowerCase(Locale.ROOT);

        char[] password = console.readPassword("Contraseña (mínimo 8 caracteres): ");
        char[] confirmation = null;
        try {
            if (password == null || password.length < 8) {
                throw new IllegalArgumentException("La contraseña debe tener al menos 8 caracteres.");
            }
            confirmation = console.readPassword("Repite la contraseña: ");
            if (confirmation == null || !Arrays.equals(password, confirmation)) {
                throw new IllegalArgumentException("Las contraseñas no coinciden.");
            }

            String hash = passwordEncoder.encode(CharBuffer.wrap(password));
            String chosenUsername = username;
            if (action.equals("create")) {
                transactions.executeWithoutResult(status -> create(chosenUsername, normalized, hash));
                console.printf("Administrador creado: %s%n", chosenUsername);
            } else {
                AdminAccount admin = admins.getFirst();
                transactions.executeWithoutResult(status -> recover(admin, chosenUsername, normalized, hash));
                console.printf("Acceso del administrador recuperado: %s. Sus sesiones anteriores fueron cerradas.%n", chosenUsername);
            }
        } finally {
            if (password != null) Arrays.fill(password, '\0');
            if (confirmation != null) Arrays.fill(confirmation, '\0');
        }
    }

    private void create(String username, String normalized, String hash) {
        if (usernameIsUsed(normalized, null)) {
            throw new IllegalArgumentException("Ese usuario ya está en uso.");
        }
        if (countAdmins() != 0) {
            throw new IllegalStateException("Ya existe un administrador.");
        }
        jdbc.update("""
            INSERT INTO app_user (id, username, username_normalized, password_hash, role, active, must_change_password)
            VALUES (?, ?, ?, ?, 'ADMIN', TRUE, FALSE)
            """, UUID.randomUUID(), username, normalized, hash);
    }

    private void recover(AdminAccount admin, String username, String normalized, String hash) {
        if (usernameIsUsed(normalized, admin.id())) {
            throw new IllegalArgumentException("Ese usuario ya está en uso.");
        }
        jdbc.update("""
            UPDATE app_user
            SET username = ?, username_normalized = ?, password_hash = ?, active = TRUE,
                must_change_password = FALSE, updated_at = now(), password_changed_at = now()
            WHERE id = ? AND role = 'ADMIN'
            """, username, normalized, hash, admin.id());
        jdbc.update("DELETE FROM spring_session WHERE principal_name IN (?, ?)", admin.id().toString(), admin.username());
    }

    private boolean usernameIsUsed(String normalized, UUID excludedId) {
        Integer count = excludedId == null
            ? jdbc.queryForObject("SELECT count(*) FROM app_user WHERE username_normalized = ?", Integer.class, normalized)
            : jdbc.queryForObject("SELECT count(*) FROM app_user WHERE username_normalized = ? AND id <> ?", Integer.class, normalized, excludedId);
        return count != null && count > 0;
    }

    private int countAdmins() {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM app_user WHERE role = 'ADMIN'", Integer.class);
        return count == null ? 0 : count;
    }

    private record AdminAccount(UUID id, String username) {}
}
