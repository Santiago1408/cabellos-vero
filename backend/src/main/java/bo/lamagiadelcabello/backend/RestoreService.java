package bo.lamagiadelcabello.backend;

import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;

import bo.lamagiadelcabello.backend.BackupService.BackupProblem;
import bo.lamagiadelcabello.backend.BackupService.Download;
import bo.lamagiadelcabello.backend.RestoreCsv.Parsed;
import bo.lamagiadelcabello.backend.RestoreCsv.Row;

@Service
class RestoreService {

    private static final Set<String> EXCLUDED_ACCOUNT_COLUMNS = Set.of(
        "password_hash", "failed_login_count", "next_login_at", "session_version",
        "last_login_at", "password_changed_at");
    private static final List<String> HISTORY_TABLES = List.of(
        "app_user_history", "supplier_history", "purchase_history", "sale_history",
        "inventory_opening_history",
        "cash_debt_history");

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final PasswordEncoder passwords;
    private final BackupService backups;
    private final TransactionTemplate transactions;

    RestoreService(JdbcTemplate jdbc, ObjectMapper json, PasswordEncoder passwords,
                   BackupService backups, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.json = json;
        this.passwords = passwords;
        this.backups = backups;
        this.transactions = new TransactionTemplate(manager);
    }

    Preview preview(byte[] bytes, UUID actorId) {
        Parsed file = RestoreCsv.parse(bytes, json);
        try {
            transactions.executeWithoutResult(status -> {
                replaceData(file, false);
                status.setRollbackOnly();
            });
        } catch (DataAccessException invalid) {
            throw problem(HttpStatus.BAD_REQUEST,
                "El respaldo no supera la validación de datos y referencias: " + safeCause(invalid));
        }
        UUID preparationId = UUID.randomUUID();
        Instant expiresAt = Instant.now().plusSeconds(2 * 60 * 60);
        jdbc.update("""
            INSERT INTO restore_preparation
                (id, actor_user_id, file_sha256, expires_at)
            VALUES (?, ?, ?, ?)
            """, preparationId, actorId, file.sha256(), java.sql.Timestamp.from(expiresAt));
        return new Preview(preparationId, expiresAt, file.sha256(),
            String.valueOf(file.manifest().get("exportedAt")), file.counts(),
            "Se reemplazarán todos los datos del negocio. Los movimientos posteriores a esta copia se perderán.");
    }

    Download preRestoreBackup(UUID preparationId, UUID actorId) {
        preparation(preparationId, actorId, false);
        Download snapshot = backups.snapshot();
        int changed = jdbc.update("""
            UPDATE restore_preparation
            SET prebackup_digest = ?, prebackup_downloaded_at = now(),
                prebackup_confirmed_at = NULL
            WHERE id = ? AND actor_user_id = ? AND completed_at IS NULL AND expires_at > now()
            """, snapshot.stateDigest(), preparationId, actorId);
        if (changed != 1) throw problem(HttpStatus.CONFLICT, "La preparación ya no está vigente.");
        return new Download("copia-previa-" + snapshot.fileName(),
            snapshot.bytes(), snapshot.stateDigest());
    }

    Preparation confirmPreRestoreBackup(UUID preparationId, UUID actorId) {
        int changed = jdbc.update("""
            UPDATE restore_preparation SET prebackup_confirmed_at = now()
            WHERE id = ? AND actor_user_id = ? AND completed_at IS NULL
                AND expires_at > now() AND prebackup_downloaded_at IS NOT NULL
            """, preparationId, actorId);
        if (changed != 1) {
            throw problem(HttpStatus.CONFLICT,
                "Descarga y guarda la copia previa antes de confirmar.");
        }
        return preparation(preparationId, actorId, false);
    }

    Result restore(UUID preparationId, byte[] bytes, String confirmation, UUID actorId) {
        if (!"RESTAURAR".equals(confirmation)) {
            throw problem(HttpStatus.BAD_REQUEST, "Escribe RESTAURAR para confirmar el reemplazo.");
        }
        Parsed file = RestoreCsv.parse(bytes, json);
        try {
            return transactions.execute(status -> {
                Preparation prepared = preparation(preparationId, actorId, true);
                if (!prepared.fileSha256().equals(file.sha256())) {
                    throw problem(HttpStatus.CONFLICT,
                        "El archivo cambió desde la vista previa. Inicia una nueva preparación.");
                }
                if (prepared.prebackupDigest() == null || prepared.prebackupConfirmedAt() == null) {
                    throw problem(HttpStatus.CONFLICT,
                        "Descarga la copia previa y confirma que quedó guardada.");
                }
                lockBusinessTables();
                String currentDigest = backups.stateDigest();
                if (!currentDigest.equals(prepared.prebackupDigest())) {
                    throw problem(HttpStatus.CONFLICT,
                        "Los datos cambiaron después de la copia previa. Repite la vista previa y descarga otra copia.");
                }
                replaceData(file, true);
                jdbc.update("UPDATE restore_preparation SET completed_at = now() WHERE id = ?",
                    preparationId);
                jdbc.update("""
                    INSERT INTO restore_event
                        (preparation_id, actor_user_id, source_sha256, previous_digest, summary)
                    VALUES (?, ?, ?, ?, ?::jsonb)
                    """, preparationId, actorId, file.sha256(), currentDigest,
                    json.writeValueAsString(file.counts()));
                return new Result(preparationId, file.sha256(), file.counts(),
                    "Restauración completada. Las cuentas conservadas mantienen sus credenciales y sesiones.");
            });
        } catch (DataAccessException invalid) {
            throw problem(HttpStatus.BAD_REQUEST,
                "No se pudo restaurar el respaldo; no se reemplazó ningún dato: " + safeCause(invalid));
        }
    }

    private void replaceData(Parsed file, boolean committed) {
        validateColumns(file);
        lockBusinessTables();
        Map<UUID, Credential> credentials = currentCredentials();
        jdbc.execute("TRUNCATE TABLE " + String.join(", ", BackupService.sourceTables()));
        for (String table : BackupService.sourceTables()) {
            for (Row row : file.rows().getOrDefault(table, List.of())) {
                String data = table.equals("app_user")
                    ? accountJson(row, credentials) : legacySaleWeights(table, row);
                jdbc.update("INSERT INTO " + table + " OVERRIDING SYSTEM VALUE "
                    + "SELECT * FROM jsonb_populate_record(NULL::" + table + ", ?::jsonb)", data);
            }
        }
        validateRestoredBalances();
        if (committed) {
            jdbc.update("UPDATE backup_settings SET pending_export_at = NULL WHERE id = 1");
            synchronizeHistorySequences();
        }
    }

    private void lockBusinessTables() {
        jdbc.execute("LOCK TABLE " + String.join(", ", BackupService.sourceTables())
            + " IN ACCESS EXCLUSIVE MODE");
    }

    private void validateColumns(Parsed file) {
        for (String table : BackupService.sourceTables()) {
            Set<String> columns = new HashSet<>(jdbc.queryForList("""
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = ?
                """, String.class, table));
            if (table.equals("app_user")) columns.removeAll(EXCLUDED_ACCOUNT_COLUMNS);
            if (columns.isEmpty()) {
                throw problem(HttpStatus.BAD_REQUEST, "La estructura de " + table + " no está disponible.");
            }
            for (Row row : file.rows().getOrDefault(table, List.of())) {
                Set<String> expected = new HashSet<>(columns);
                if (table.equals("stock_lot") &&
                    Integer.valueOf(3).equals(file.manifest().get("version"))) {
                    expected.removeAll(Set.of("opening_id", "opening_order", "origin_date",
                        "cost_estimated", "opening_note"));
                }
                if ((table.equals("sale_line") || table.equals("sale_delivery_line"))
                    && !Integer.valueOf(5).equals(file.manifest().get("version"))) {
                    expected.remove("final_weight");
                }
                if ((table.equals("sale_line") || table.equals("sale_delivery_line"))
                    && row.values().containsKey("final_weight")) {
                    expected.add("final_weight");
                }
                if (!expected.equals(row.values().keySet())) {
                    throw problem(HttpStatus.BAD_REQUEST,
                        "Las columnas de " + table + " no coinciden con esta versión del backend.");
                }
            }
        }
    }

    private String legacySaleWeights(String table, Row row) {
        if (!table.equals("sale_line") && !table.equals("sale_delivery_line")) return row.data();
        if (row.values().containsKey("final_weight")) return row.data();
        Map<String, Object> values = new LinkedHashMap<>(row.values());
        values.put("final_weight", values.get(table.equals("sale_line") ? "agreed_weight" : "weight"));
        return json.writeValueAsString(values);
    }

    private Map<UUID, Credential> currentCredentials() {
        Map<UUID, Credential> current = new HashMap<>();
        jdbc.query("""
            SELECT id, role, password_hash, active, must_change_password, session_version,
                failed_login_count, next_login_at, last_login_at, password_changed_at
            FROM app_user
            """, row -> {
                var next = row.getTimestamp("next_login_at");
                var last = row.getTimestamp("last_login_at");
                current.put((UUID) row.getObject("id"), new Credential(
                    row.getString("role"), row.getString("password_hash"), row.getBoolean("active"),
                    row.getBoolean("must_change_password"), row.getLong("session_version"),
                    row.getInt("failed_login_count"),
                    next == null ? null : next.toInstant(),
                    last == null ? null : last.toInstant(),
                    row.getTimestamp("password_changed_at").toInstant()));
            });
        return current;
    }

    private String accountJson(Row row, Map<UUID, Credential> current) {
        UUID id;
        try { id = UUID.fromString(row.id()); }
        catch (IllegalArgumentException invalid) {
            throw problem(HttpStatus.BAD_REQUEST, "Hay un identificador de cuenta inválido.");
        }
        Credential previous = current.get(id);
        Map<String, Object> values = new LinkedHashMap<>(row.values());
        boolean importedActive = Boolean.TRUE.equals(values.get("active"));
        if (previous == null) {
            values.put("password_hash", passwords.encode(UUID.randomUUID().toString()
                + UUID.randomUUID()));
            values.put("active", importedActive);
            values.put("must_change_password", true);
            values.put("session_version", 0);
            values.put("failed_login_count", 0);
            values.put("next_login_at", null);
            values.put("last_login_at", null);
            values.put("password_changed_at", Instant.now());
        } else {
            if (!previous.role().equals(values.get("role"))) {
                throw problem(HttpStatus.BAD_REQUEST,
                    "Una cuenta conservada tiene un rol diferente en el respaldo.");
            }
            values.put("password_hash", previous.passwordHash());
            values.put("active", importedActive && previous.active());
            values.put("must_change_password", previous.mustChangePassword());
            values.put("session_version", previous.sessionVersion());
            values.put("failed_login_count", previous.failedLoginCount());
            values.put("next_login_at", previous.nextLoginAt());
            values.put("last_login_at", previous.lastLoginAt());
            values.put("password_changed_at", previous.passwordChangedAt());
        }
        return json.writeValueAsString(values);
    }

    private void validateRestoredBalances() {
        Long invalidOpeningLots = jdbc.queryForObject("""
            SELECT count(*) FROM stock_lot lot
            JOIN inventory_opening opening ON opening.id = lot.opening_id
            WHERE lot.effective_at <> opening.cutoff_at
                OR lot.origin_date > (opening.cutoff_at AT TIME ZONE 'America/La_Paz')::date
            """, Long.class);
        if (invalidOpeningLots != null && invalidOpeningLots > 0) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Hay lotes de apertura que no corresponden a su fecha de corte.");
        }
        Long movementsBeforeOpening = jdbc.queryForObject("""
            SELECT count(*) FROM inventory_opening opening
            WHERE EXISTS (SELECT 1 FROM purchase_receipt receipt
                    WHERE receipt.effective_at <= opening.cutoff_at)
               OR EXISTS (SELECT 1 FROM sale_delivery delivery
                    WHERE delivery.effective_at <= opening.cutoff_at)
            """, Long.class);
        if (movementsBeforeOpening != null && movementsBeforeOpening > 0) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Hay recepciones o entregas anteriores a la apertura de inventario.");
        }
        Long futureLots = jdbc.queryForObject("""
            SELECT count(*) FROM stock_consumption consumption
            JOIN stock_lot lot ON lot.id = consumption.stock_lot_id
            JOIN sale_delivery_line item ON item.id = consumption.delivery_line_id
            JOIN sale_delivery delivery ON delivery.id = item.delivery_id
            WHERE lot.effective_at > delivery.effective_at
            """, Long.class);
        if (futureLots != null && futureLots > 0) {
            throw problem(HttpStatus.BAD_REQUEST,
                "El respaldo asigna a una venta cabello que aún no existía en esa fecha.");
        }
        Long excessDebts = jdbc.queryForObject("""
            SELECT count(*) FROM cash_debt d
            LEFT JOIN (SELECT debt_id, SUM(amount) AS paid FROM cash_debt_payment
                WHERE voided_at IS NULL GROUP BY debt_id) p ON p.debt_id = d.id
            WHERE COALESCE(p.paid, 0) > d.total
            """, Long.class);
        if (excessDebts != null && excessDebts > 0) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Hay deudas cuyos abonos vigentes superan el importe original.");
        }
        Long invalidLots = jdbc.queryForObject("""
            SELECT count(*) FROM stock_lot l
            LEFT JOIN (SELECT stock_lot_id, SUM(weight) AS consumed
                FROM stock_consumption GROUP BY stock_lot_id) c ON c.stock_lot_id = l.id
            WHERE l.voided_at IS NULL
                AND l.remaining_weight <> l.original_weight - COALESCE(c.consumed, 0)
            """, Long.class);
        if (invalidLots != null && invalidLots > 0) {
            throw problem(HttpStatus.BAD_REQUEST,
                "El peso restante de algunos lotes no coincide con sus consumos.");
        }
        Long invalidDeliveries = jdbc.queryForObject("""
            SELECT count(*) FROM sale_delivery_line line
            JOIN sale_delivery delivery ON delivery.id = line.delivery_id
            LEFT JOIN (SELECT delivery_line_id, SUM(weight) AS allocated
                FROM stock_consumption GROUP BY delivery_line_id) c ON c.delivery_line_id = line.id
            WHERE delivery.voided_at IS NULL AND line.weight <> COALESCE(c.allocated, 0)
            """, Long.class);
        if (invalidDeliveries != null && invalidDeliveries > 0) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Hay entregas cuyo peso no coincide con los lotes consumidos.");
        }
        Long voidedAllocations = jdbc.queryForObject("""
            SELECT count(*) FROM stock_consumption c
            JOIN stock_lot lot ON lot.id = c.stock_lot_id
            JOIN sale_delivery_line line ON line.id = c.delivery_line_id
            JOIN sale_delivery delivery ON delivery.id = line.delivery_id
            WHERE lot.voided_at IS NOT NULL OR delivery.voided_at IS NOT NULL
            """, Long.class);
        if (voidedAllocations != null && voidedAllocations > 0) {
            throw problem(HttpStatus.BAD_REQUEST,
                "El respaldo asigna cabello de movimientos anulados.");
        }
        Long excessPurchasePayments = jdbc.queryForObject("""
            WITH received AS (
                SELECT item.purchase_line_id, SUM(item.weight) AS weight
                FROM purchase_receipt_line item
                JOIN purchase_receipt receipt ON receipt.id = item.receipt_id
                WHERE receipt.voided_at IS NULL GROUP BY item.purchase_line_id
            ), payable AS (
                SELECT line.purchase_id,
                    SUM(ROUND((CASE WHEN operation.status = 'CANCELED'
                        THEN COALESCE(received.weight, 0) ELSE line.agreed_weight END)
                        * line.price_per_gram, 2)) AS total
                FROM purchase_line line
                JOIN purchase_order operation ON operation.id = line.purchase_id
                LEFT JOIN received ON received.purchase_line_id = line.id
                GROUP BY line.purchase_id
            ), paid AS (
                SELECT purchase_id, SUM(amount) AS total FROM purchase_payment
                WHERE voided_at IS NULL GROUP BY purchase_id
            )
            SELECT count(*) FROM purchase_order operation
            LEFT JOIN payable ON payable.purchase_id = operation.id
            LEFT JOIN paid ON paid.purchase_id = operation.id
            WHERE COALESCE(paid.total, 0) > COALESCE(payable.total, 0)
            """, Long.class);
        if (excessPurchasePayments != null && excessPurchasePayments > 0) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Hay compras con pagos superiores a su importe exigible.");
        }
        Long excessSalePayments = jdbc.queryForObject("""
            WITH delivered AS (
                SELECT item.sale_line_id, SUM(item.final_weight) AS weight
                FROM sale_delivery_line item
                JOIN sale_delivery delivery ON delivery.id = item.delivery_id
                WHERE delivery.voided_at IS NULL GROUP BY item.sale_line_id
            ), payable AS (
                SELECT line.sale_id,
                    SUM(ROUND((CASE WHEN operation.status = 'CANCELED'
                        THEN COALESCE(delivered.weight, 0) ELSE line.final_weight END)
                        * line.price_per_gram, 2)) AS total
                FROM sale_line line
                JOIN sale_order operation ON operation.id = line.sale_id
                LEFT JOIN delivered ON delivered.sale_line_id = line.id
                GROUP BY line.sale_id
            ), paid AS (
                SELECT sale_id, SUM(amount) AS total FROM sale_payment
                WHERE voided_at IS NULL GROUP BY sale_id
            )
            SELECT count(*) FROM sale_order operation
            LEFT JOIN payable ON payable.sale_id = operation.id
            LEFT JOIN paid ON paid.sale_id = operation.id
            WHERE COALESCE(paid.total, 0) > COALESCE(payable.total, 0)
            """, Long.class);
        if (excessSalePayments != null && excessSalePayments > 0) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Hay ventas con cobros superiores a su importe exigible.");
        }
        Long excessivePurchaseReceipts = jdbc.queryForObject("""
            SELECT count(*) FROM purchase_line line
            LEFT JOIN (SELECT item.purchase_line_id, SUM(item.weight) AS weight
                FROM purchase_receipt_line item
                JOIN purchase_receipt receipt ON receipt.id = item.receipt_id
                WHERE receipt.voided_at IS NULL GROUP BY item.purchase_line_id) received
                ON received.purchase_line_id = line.id
            WHERE COALESCE(received.weight, 0) > line.agreed_weight
            """, Long.class);
        Long excessiveSaleDeliveries = jdbc.queryForObject("""
            SELECT count(*) FROM sale_line line
            LEFT JOIN (SELECT item.sale_line_id, SUM(item.weight) AS weight
                FROM sale_delivery_line item
                JOIN sale_delivery delivery ON delivery.id = item.delivery_id
                WHERE delivery.voided_at IS NULL GROUP BY item.sale_line_id) delivered
                ON delivered.sale_line_id = line.id
            WHERE COALESCE(delivered.weight, 0) > line.agreed_weight
            """, Long.class);
        if ((excessivePurchaseReceipts != null && excessivePurchaseReceipts > 0)
            || (excessiveSaleDeliveries != null && excessiveSaleDeliveries > 0)) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Hay operaciones con más peso recibido o entregado que el acordado.");
        }
        Long invalidFinalWeights = jdbc.queryForObject("""
            SELECT (SELECT count(*) FROM sale_line line
                    JOIN sale_order operation ON operation.id = line.sale_id
                    LEFT JOIN (SELECT item.sale_line_id,
                        SUM(item.weight) AS hair_weight,
                        SUM(item.final_weight) AS final_weight
                        FROM sale_delivery_line item
                        JOIN sale_delivery movement ON movement.id = item.delivery_id
                        WHERE movement.voided_at IS NULL GROUP BY item.sale_line_id) delivered
                        ON delivered.sale_line_id = line.id
                    WHERE COALESCE(delivered.final_weight, 0) > line.final_weight
                       OR line.final_weight - COALESCE(delivered.final_weight, 0)
                          < line.agreed_weight - COALESCE(delivered.hair_weight, 0)
                       OR (operation.status = 'CONFIRMED'
                           AND (COALESCE(delivered.hair_weight, 0) <> line.agreed_weight
                                OR COALESCE(delivered.final_weight, 0) <> line.final_weight)))
                 + (SELECT count(*) FROM sale_delivery_line
                    WHERE final_weight < weight)
            """, Long.class);
        if (invalidFinalWeights != null && invalidFinalWeights > 0) {
            throw problem(HttpStatus.BAD_REQUEST,
                "El respaldo tiene pesos finales de venta incompatibles con el cabello entregado.");
        }
        Long uncoveredReservations = jdbc.queryForObject("""
            WITH delivered AS (
                SELECT item.sale_line_id, SUM(item.weight) AS weight
                FROM sale_delivery_line item JOIN sale_delivery movement ON movement.id = item.delivery_id
                WHERE movement.voided_at IS NULL GROUP BY item.sale_line_id
            ), reserved AS (
                SELECT line.category_code, line.length_cm,
                    SUM(line.agreed_weight - COALESCE(delivered.weight, 0)) AS weight
                FROM sale_line line JOIN sale_order operation ON operation.id = line.sale_id
                LEFT JOIN delivered ON delivered.sale_line_id = line.id
                WHERE operation.status = 'PENDING'
                GROUP BY line.category_code, line.length_cm
            ), received AS (
                SELECT item.purchase_line_id, SUM(item.weight) AS weight
                FROM purchase_receipt_line item JOIN purchase_receipt movement ON movement.id = item.receipt_id
                WHERE movement.voided_at IS NULL GROUP BY item.purchase_line_id
            ), incoming AS (
                SELECT line.category_code, line.length_cm,
                    SUM(line.agreed_weight - COALESCE(received.weight, 0)) AS weight
                FROM purchase_line line JOIN purchase_order operation ON operation.id = line.purchase_id
                LEFT JOIN received ON received.purchase_line_id = line.id
                WHERE operation.status = 'PENDING'
                GROUP BY line.category_code, line.length_cm
            ), physical AS (
                SELECT category_code, length_cm, SUM(remaining_weight) AS weight
                FROM stock_lot WHERE voided_at IS NULL GROUP BY category_code, length_cm
            )
            SELECT count(*) FROM reserved
            LEFT JOIN incoming USING (category_code, length_cm)
            LEFT JOIN physical USING (category_code, length_cm)
            WHERE reserved.weight > COALESCE(incoming.weight, 0) + COALESCE(physical.weight, 0)
            """, Long.class);
        if (uncoveredReservations != null && uncoveredReservations > 0) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Hay ventas reservadas sin suficiente cabello físico o pendiente de recibir.");
        }
    }

    private void synchronizeHistorySequences() {
        for (String table : HISTORY_TABLES) {
            Long next = jdbc.queryForObject("SELECT COALESCE(MAX(id), 0) + 1 FROM " + table,
                Long.class);
            jdbc.execute("ALTER SEQUENCE public." + table + "_id_seq RESTART WITH " + next);
        }
    }

    private Preparation preparation(UUID id, UUID actorId, boolean lock) {
        String sql = """
            SELECT id, actor_user_id, file_sha256, created_at, expires_at,
                prebackup_digest, prebackup_downloaded_at, prebackup_confirmed_at, completed_at
            FROM restore_preparation WHERE id = ? AND actor_user_id = ?
            """ + (lock ? " FOR UPDATE" : "");
        Preparation row = jdbc.query(sql, (rs, number) -> new Preparation(
            (UUID) rs.getObject("id"), (UUID) rs.getObject("actor_user_id"),
            rs.getString("file_sha256"), rs.getTimestamp("created_at").toInstant(),
            rs.getTimestamp("expires_at").toInstant(), rs.getString("prebackup_digest"),
            instant(rs.getTimestamp("prebackup_downloaded_at")),
            instant(rs.getTimestamp("prebackup_confirmed_at")),
            instant(rs.getTimestamp("completed_at"))), id, actorId).stream().findFirst()
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Preparación de restauración no encontrada."));
        if (row.completedAt() != null || !Instant.now().isBefore(row.expiresAt())) {
            throw problem(HttpStatus.CONFLICT,
                "La preparación expiró o ya fue utilizada. Inicia una nueva vista previa.");
        }
        return row;
    }

    private static Instant instant(java.sql.Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    private static String safeCause(DataAccessException invalid) {
        // Los errores SQL pueden incluir una fila completa; nunca exponerlos al navegador.
        return "hay datos incompatibles con las restricciones de la base de datos";
    }

    private static BackupProblem problem(HttpStatus status, String message) {
        return new BackupProblem(status, message);
    }

    private record Credential(String role, String passwordHash, boolean active, boolean mustChangePassword,
                              long sessionVersion, int failedLoginCount, Instant nextLoginAt,
                              Instant lastLoginAt, Instant passwordChangedAt) {}

    record Preview(UUID preparationId, Instant expiresAt, String fileSha256,
                   String exportedAt, Map<String, Integer> counts, String warning) {}
    record Preparation(UUID id, UUID actorUserId, String fileSha256, Instant createdAt,
                       Instant expiresAt, String prebackupDigest, Instant prebackupDownloadedAt,
                       Instant prebackupConfirmedAt, Instant completedAt) {}
    record Result(UUID preparationId, String fileSha256, Map<String, Integer> counts,
                  String message) {}
}
