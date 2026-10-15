package bo.lamagiadelcabello.backend;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class SupplierRepository {

    private static final String COLUMNS =
        "id, name, phone, city, address, maps_url, created_at, modified_at";

    private final JdbcTemplate jdbc;

    SupplierRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<Supplier> findAll() {
        return jdbc.query(
            "SELECT " + COLUMNS + " FROM supplier ORDER BY lower(name), id",
            SupplierRepository::mapSupplier
        );
    }

    Optional<Supplier> findById(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM supplier WHERE id = ?",
            SupplierRepository::mapSupplier, id).stream().findFirst();
    }

    Optional<Supplier> findByIdForUpdate(UUID id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM supplier WHERE id = ? FOR UPDATE",
            SupplierRepository::mapSupplier, id).stream().findFirst();
    }

    boolean nameExists(String name, UUID exceptId) {
        Integer count = exceptId == null
            ? jdbc.queryForObject("SELECT count(*) FROM supplier WHERE lower(trim(name)) = lower(?)", Integer.class, name)
            : jdbc.queryForObject("SELECT count(*) FROM supplier WHERE lower(trim(name)) = lower(?) AND id <> ?", Integer.class, name, exceptId);
        return count != null && count > 0;
    }

    void create(UUID id, SupplierData data) {
        jdbc.update("""
            INSERT INTO supplier (id, name, phone, city, address, maps_url)
            VALUES (?, ?, ?, ?, ?, ?)
            """, id, data.name(), data.phone(), data.city(), data.address(), data.mapsUrl());
    }

    void update(UUID id, SupplierData data) {
        jdbc.update("""
            UPDATE supplier
            SET name = ?, phone = ?, city = ?, address = ?, maps_url = ?, modified_at = now()
            WHERE id = ?
            """, data.name(), data.phone(), data.city(), data.address(), data.mapsUrl(), id);
    }

    void delete(UUID id) {
        jdbc.update("DELETE FROM supplier WHERE id = ?", id);
    }

    void addHistory(UUID supplierId, String eventType, UUID actorId, String reason,
                    String oldValuesJson, String newValuesJson) {
        jdbc.update("""
            INSERT INTO supplier_history
                (supplier_id, event_type, actor_user_id, reason, old_values, new_values)
            VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb)
            """, supplierId, eventType, actorId, reason, oldValuesJson, newValuesJson);
    }

    List<History> history(UUID supplierId) {
        return jdbc.query("""
            SELECT id, changed_at, event_type, actor_user_id, reason,
                   old_values::text AS old_values_json, new_values::text AS new_values_json
            FROM supplier_history WHERE supplier_id = ?
            ORDER BY changed_at DESC, id DESC
            """, (row, number) -> new History(
                row.getLong("id"), row.getTimestamp("changed_at").toInstant(),
                row.getString("event_type"), (UUID) row.getObject("actor_user_id"),
                row.getString("reason"), row.getString("old_values_json"),
                row.getString("new_values_json")
            ), supplierId);
    }

    private static Supplier mapSupplier(ResultSet row, int number) throws SQLException {
        var modified = row.getTimestamp("modified_at");
        return new Supplier(
            (UUID) row.getObject("id"), row.getString("name"), row.getString("phone"),
            row.getString("city"), row.getString("address"), row.getString("maps_url"),
            row.getTimestamp("created_at").toInstant(),
            modified == null ? null : modified.toInstant()
        );
    }

    record Supplier(UUID id, String name, String phone, String city, String address,
                    String mapsUrl, Instant createdAt, Instant modifiedAt) {}

    record SupplierData(String name, String phone, String city, String address, String mapsUrl) {}

    record History(long id, Instant changedAt, String eventType, UUID actorUserId,
                   String reason, String oldValuesJson, String newValuesJson) {}
}
