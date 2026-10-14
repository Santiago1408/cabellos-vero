package bo.lamagiadelcabello.backend;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class CatalogRepository {

    private final JdbcTemplate jdbc;

    CatalogRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<Category> categories() {
        return jdbc.query("""
            SELECT code, display_name FROM hair_category
            ORDER BY lower(display_name), code
            """, (row, number) -> new Category(row.getString("code"), row.getString("display_name")));
    }

    List<Length> lengths() {
        return jdbc.query("""
            SELECT centimeters FROM hair_length ORDER BY centimeters
            """, (row, number) -> new Length(row.getInt("centimeters")));
    }

    List<Category> lockCategories() {
        return jdbc.query("""
            SELECT code, display_name FROM hair_category ORDER BY code FOR UPDATE
            """, (row, number) -> new Category(row.getString("code"), row.getString("display_name")));
    }

    List<Length> lockLengths() {
        return jdbc.query("""
            SELECT centimeters FROM hair_length ORDER BY centimeters FOR UPDATE
            """, (row, number) -> new Length(row.getInt("centimeters")));
    }

    boolean categoryNameExists(String name) {
        Integer count = jdbc.queryForObject("""
            SELECT count(*) FROM hair_category WHERE lower(trim(display_name)) = lower(?)
            """, Integer.class, name);
        return count != null && count > 0;
    }

    boolean lengthExists(int centimeters) {
        Integer count = jdbc.queryForObject(
            "SELECT count(*) FROM hair_length WHERE centimeters = ?", Integer.class, centimeters);
        return count != null && count > 0;
    }

    void addCategory(String code, String name) {
        jdbc.update("INSERT INTO hair_category (code, display_name) VALUES (?, ?)", code, name);
    }

    void addLength(int centimeters) {
        jdbc.update("INSERT INTO hair_length (centimeters) VALUES (?)", centimeters);
    }

    void deleteCategory(String code) {
        jdbc.update("DELETE FROM hair_category WHERE code = ?", code);
    }

    void deleteLength(int centimeters) {
        jdbc.update("DELETE FROM hair_length WHERE centimeters = ?", centimeters);
    }

    record Category(String code, String displayName) {}
    record Length(int centimeters) {}
}
