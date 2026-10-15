package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class SaleInventoryRepository {

    private final JdbcTemplate jdbc;

    SaleInventoryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    void lockTypes(Collection<HairType> types) {
        Set<String> categories = new HashSet<>();
        for (HairType type : types) categories.add(type.categoryCode());
        categories.stream().sorted().forEach(category ->
            jdbc.query("SELECT code FROM hair_category WHERE code = ? FOR NO KEY UPDATE",
                row -> {}, category));
    }

    StockPosition position(HairType type) {
        BigDecimal physical = amount("""
            SELECT COALESCE(SUM(remaining_weight), 0) FROM stock_lot
            WHERE category_code = ? AND length_cm = ? AND voided_at IS NULL
            """, type);
        BigDecimal pending = amount("""
            SELECT COALESCE(SUM(l.agreed_weight - COALESCE(r.received_weight, 0)), 0)
            FROM purchase_line l
            JOIN purchase_order p ON p.id = l.purchase_id
            LEFT JOIN (
                SELECT rl.purchase_line_id, SUM(rl.weight) AS received_weight
                FROM purchase_receipt_line rl
                JOIN purchase_receipt pr ON pr.id = rl.receipt_id
                WHERE pr.voided_at IS NULL
                GROUP BY rl.purchase_line_id
            ) r ON r.purchase_line_id = l.id
            WHERE p.status = 'PENDING' AND l.category_code = ? AND l.length_cm = ?
            """, type);
        BigDecimal reserved = amount("""
            SELECT COALESCE(SUM(l.agreed_weight), 0)
            FROM sale_line l
            JOIN sale_order s ON s.id = l.sale_id
            WHERE s.status = 'PENDING' AND l.category_code = ? AND l.length_cm = ?
            """, type);
        return new StockPosition(physical, pending, reserved);
    }

    List<BackingShortage> backingShortages(Collection<HairType> types) {
        return types.stream().distinct().sorted().map(type -> {
            StockPosition position = position(type);
            BigDecimal missing = position.reserved()
                .subtract(position.physical()).subtract(position.pending());
            return new BackingShortage(type, position, missing);
        }).filter(shortage -> shortage.missing().signum() > 0).toList();
    }

    private BigDecimal amount(String sql, HairType type) {
        BigDecimal value = jdbc.queryForObject(sql, BigDecimal.class,
            type.categoryCode(), type.lengthCm());
        return value == null ? BigDecimal.ZERO.setScale(2) : value.setScale(2);
    }

    record HairType(String categoryCode, int lengthCm) implements Comparable<HairType> {
        @Override public int compareTo(HairType other) {
            return Comparator.comparing(HairType::categoryCode)
                .thenComparingInt(HairType::lengthCm).compare(this, other);
        }
    }

    record StockPosition(BigDecimal physical, BigDecimal pending, BigDecimal reserved) {}

    record BackingShortage(HairType type, StockPosition position, BigDecimal missing) {}
}
