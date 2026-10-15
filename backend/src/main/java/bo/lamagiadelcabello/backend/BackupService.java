package bo.lamagiadelcabello.backend;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.HexFormat;

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
    private static final int VERSION = 4;

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
        new Source("inventory_opening", "id::text", "to_jsonb(t)"),
        new Source("inventory_opening_history", "id::text", "to_jsonb(t)"),
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
        Download snapshot = snapshotTransaction.execute(status -> buildCsv());
        jdbc.update("UPDATE backup_settings SET pending_export_at = now() WHERE id = 1");
        return snapshot;
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

    Download snapshot() { return snapshotTransaction.execute(status -> buildCsv()); }

    String stateDigest() {
        MessageDigest digest = sha256();
        for (Source source : SOURCES) {
            if (source.table().equals("backup_settings")) continue;
            for (Entry entry : rows(source)) updateDigest(digest, entry);
        }
        updateSettingsDigest(digest);
        return HexFormat.of().formatHex(digest.digest());
    }

    static List<String> sourceTables() { return SOURCES.stream().map(Source::table).toList(); }

    static List<String> sourceTablesV3() {
        return SOURCES.stream().map(Source::table)
            .filter(table -> !table.equals("inventory_opening")
                && !table.equals("inventory_opening_history"))
            .toList();
    }

    private Download buildCsv() {
        List<Entry> entries = new ArrayList<>();
        Map<String, Integer> counts = new LinkedHashMap<>();
        MessageDigest digest = sha256();
        for (Source source : SOURCES) {
            List<Entry> rows = rows(source);
            counts.put(source.table(), rows.size());
            entries.addAll(rows);
            if (!source.table().equals("backup_settings")) {
                for (Entry entry : rows) updateDigest(digest, entry);
            }
        }
        updateSettingsDigest(digest);
        Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("format", FORMAT);
        manifest.put("version", VERSION);
        manifest.put("schema", "backend-relational");
        manifest.put("exportedAt", Instant.now().toString());
        manifest.put("currency", "BOB");
        manifest.put("weightUnit", "g");
        manifest.put("businessTimeZone", BUSINESS_ZONE.getId());
        manifest.put("counts", counts);
        String stateDigest = HexFormat.of().formatHex(digest.digest());
        manifest.put("stateDigest", stateDigest);
        manifest.put("note", "No incluye contraseñas, hashes ni sesiones activas.");

        StringBuilder csv = new StringBuilder("\uFEFFTipo de registro;Identificador;Datos completos JSON\r\n");
        row(csv, "manifest", "backup", json.writeValueAsString(manifest));
        for (Entry entry : entries) row(csv, entry.type(), entry.id(), entry.data());
        String fileName = "respaldo-completo-cabello-"
            + LocalDate.now(BUSINESS_ZONE) + ".csv";
        return new Download(fileName, csv.toString().getBytes(StandardCharsets.UTF_8), stateDigest);
    }

    private List<Entry> rows(Source source) {
        String sql = "SELECT " + source.idExpression() + " AS record_id, ("
            + source.dataExpression() + ")::text AS record_data FROM "
            + source.table() + " t ORDER BY " + source.idExpression();
        return jdbc.query(sql, (row, number) -> new Entry(source.table(),
            row.getString("record_id"), row.getString("record_data")));
    }

    private static void updateDigest(MessageDigest digest, Entry entry) {
        digest.update(entry.type().getBytes(StandardCharsets.UTF_8));
        digest.update((byte) 0);
        digest.update(entry.id().getBytes(StandardCharsets.UTF_8));
        digest.update((byte) 0);
        digest.update(entry.data().getBytes(StandardCharsets.UTF_8));
        digest.update((byte) '\n');
    }

    private void updateSettingsDigest(MessageDigest digest) {
        Integer interval = jdbc.queryForObject(
            "SELECT interval_days FROM backup_settings WHERE id = 1", Integer.class);
        digest.update("backup_settings\0".getBytes(StandardCharsets.UTF_8));
        digest.update("1\0".getBytes(StandardCharsets.UTF_8));
        digest.update(String.valueOf(interval).getBytes(StandardCharsets.UTF_8));
        digest.update((byte) '\n');
    }

    private static MessageDigest sha256() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 no está disponible.", impossible);
        }
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
    record Download(String fileName, byte[] bytes, String stateDigest) {}
}
