package bo.lamagiadelcabello.backend;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;

@Service
class BackupService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/La_Paz");
    private static final String FORMAT = "la-magia-del-cabello-csv";
    private static final int VERSION = 3;

    // Lista cerrada: ninguna tabla de sesiones, migraciones ni hashes de contraseña se exporta.
    private static final List<Source> SOURCES = List.of(
        new Source("app_user", "id::text", "to_jsonb(t) - 'password_hash' - 'failed_login_count'"
            + " - 'next_login_at' - 'session_version' - 'last_login_at' - 'password_changed_at'"),
        new Source("app_user_history", "id::text", "to_jsonb(t)"),
        new Source("hair_category", "code", "to_jsonb(t)"),
        new Source("hair_length", "centimeters::text", "to_jsonb(t)"),
        new Source("supplier", "id::text", "to_jsonb(t)"),
        new Source("supplier_history", "id::text", "to_jsonb(t)"),
        new Source("purchase_order", "id::text", "to_jsonb(t)"),
        new Source("purchase_line", "id::text", "to_jsonb(t)"),
        new Source("purchase_receipt", "id::text", "to_jsonb(t)"),
        new Source("purchase_receipt_line", "id::text", "to_jsonb(t)"),
        new Source("stock_lot", "id::text", "to_jsonb(t)"),
        new Source("purchase_history", "id::text", "to_jsonb(t)"),
        new Source("purchase_payment", "id::text", "to_jsonb(t)"),
        new Source("sale_order", "id::text", "to_jsonb(t)"),
        new Source("sale_line", "id::text", "to_jsonb(t)"),
        new Source("sale_history", "id::text", "to_jsonb(t)"),
        new Source("sale_delivery", "id::text", "to_jsonb(t)"),
        new Source("sale_delivery_line", "id::text", "to_jsonb(t)"),
        new Source("stock_consumption", "id::text", "to_jsonb(t)"),
        new Source("sale_payment", "id::text", "to_jsonb(t)"),
        new Source("cash_debt", "id::text", "to_jsonb(t)"),
        new Source("cash_debt_payment", "id::text", "to_jsonb(t)"),
        new Source("cash_debt_history", "id::text", "to_jsonb(t)"),
        new Source("backup_settings", "id::text", "to_jsonb(t)")
    );

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final TransactionTemplate snapshotTransaction;

    BackupService(JdbcTemplate jdbc, ObjectMapper json,
                  PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.json = json;
        this.snapshotTransaction = new TransactionTemplate(transactionManager);
        this.snapshotTransaction.setReadOnly(true);
        this.snapshotTransaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    Settings settings() {
        return jdbc.queryForObject("""
            SELECT interval_days, last_confirmed_at, pending_export_at FROM backup_settings WHERE id = 1
            """, (row, number) -> {
                var last = row.getTimestamp("last_confirmed_at");
                var pending = row.getTimestamp("pending_export_at");
                Instant confirmed = last == null ? null : last.toInstant();
                Instant pendingAt = pending == null ? null : pending.toInstant();
                int interval = row.getInt("interval_days");
                Instant next = confirmed == null ? null : confirmed.plusSeconds(interval * 86_400L);
                return new Settings(interval, confirmed, pendingAt, next,
                    next == null || !Instant.now().isBefore(next));
            });
    }

    Settings changeInterval(Integer intervalDays) {
        if (intervalDays == null || intervalDays < 1 || intervalDays > 365) {
            throw problem(HttpStatus.BAD_REQUEST, "El intervalo debe tener entre 1 y 365 días.");
        }
        jdbc.update("UPDATE backup_settings SET interval_days = ? WHERE id = 1", intervalDays);
        return settings();
    }

    Download export() {
        byte[] bytes = snapshotTransaction.execute(status -> buildCsv());
        jdbc.update("UPDATE backup_settings SET pending_export_at = now() WHERE id = 1");
        String fileName = "respaldo-completo-cabello-"
            + LocalDate.now(BUSINESS_ZONE) + ".csv";
        return new Download(fileName, bytes);
    }

    Settings confirmSaved() {
        int changed = jdbc.update("""
            UPDATE backup_settings
            SET last_confirmed_at = pending_export_at, pending_export_at = NULL
            WHERE id = 1 AND pending_export_at IS NOT NULL
            """);
        if (changed != 1) {
            throw problem(HttpStatus.CONFLICT,
                "Descarga primero el respaldo y comprueba que quedó guardado.");
        }
        return settings();
    }

    private byte[] buildCsv() {
        List<Entry> entries = new ArrayList<>();
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Source source : SOURCES) {
            String sql = "SELECT " + source.idExpression() + " AS record_id, ("
                + source.dataExpression() + ")::text AS record_data FROM "
                + source.table() + " t ORDER BY " + source.idExpression();
            List<Entry> rows = jdbc.query(sql, (row, number) -> new Entry(source.table(),
                row.getString("record_id"), row.getString("record_data")));
            counts.put(source.table(), rows.size());
            entries.addAll(rows);
        }
        Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("format", FORMAT);
        manifest.put("version", VERSION);
        manifest.put("schema", "backend-relational");
        manifest.put("exportedAt", Instant.now().toString());
        manifest.put("currency", "BOB");
        manifest.put("weightUnit", "g");
        manifest.put("businessTimeZone", BUSINESS_ZONE.getId());
        manifest.put("counts", counts);
        manifest.put("note", "No incluye contraseñas, hashes ni sesiones activas.");

        StringBuilder csv = new StringBuilder("\uFEFFTipo de registro;Identificador;Datos completos JSON\r\n");
        row(csv, "manifest", "backup", json.writeValueAsString(manifest));
        for (Entry entry : entries) row(csv, entry.type(), entry.id(), entry.data());
        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static void row(StringBuilder csv, String type, String id, String data) {
        cell(csv, type);
        csv.append(';');
        cell(csv, id);
        csv.append(';');
        cell(csv, data);
        csv.append("\r\n");
    }

    private static void cell(StringBuilder csv, String value) {
        csv.append('"').append(value.replace("\"", "\"\"")).append('"');
    }

    static final class BackupProblem extends RuntimeException {
        private final HttpStatus status;
        BackupProblem(HttpStatus status, String message) { super(message); this.status = status; }
        HttpStatus status() { return status; }
    }

    private static BackupProblem problem(HttpStatus status, String message) {
        return new BackupProblem(status, message);
    }

    private record Source(String table, String idExpression, String dataExpression) {}
    private record Entry(String type, String id, String data) {}
    record Settings(int intervalDays, Instant lastConfirmedAt, Instant pendingExportAt,
                    Instant nextReminderAt, boolean due) {}
    record Download(String fileName, byte[] bytes) {}
}
