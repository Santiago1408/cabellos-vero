package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class ReportRepository {

    private final JdbcTemplate jdbc;

    ReportRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<ReceivedHair> receipts() {
        return jdbc.query("""
            SELECT rl.id, pr.effective_at, rl.weight, lv.purchase_value
            FROM purchase_receipt_line rl
            JOIN purchase_receipt pr ON pr.id = rl.receipt_id
            JOIN stock_lot sl ON sl.receipt_line_id = rl.id
            JOIN active_stock_lot_value lv ON lv.stock_lot_id = sl.id
            WHERE pr.voided_at IS NULL AND sl.voided_at IS NULL
            ORDER BY pr.effective_at, rl.id
            """, (row, number) -> new ReceivedHair(
                (UUID) row.getObject("id"), row.getTimestamp("effective_at").toInstant(),
                row.getBigDecimal("weight"), row.getBigDecimal("purchase_value")
            ));
    }

    List<DeliveredHair> deliveries() {
        return jdbc.query("""
            WITH ordered_consumption AS (
                SELECT sc.delivery_line_id, sc.weight, sl.original_weight,
                       lv.purchase_value * 100 AS lot_value_cents,
                       SUM(sc.weight) OVER (
                           PARTITION BY sc.stock_lot_id
                           ORDER BY sd.effective_at, sd.recorded_at, sd.id, dl.id
                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                       ) AS cumulative_weight
                FROM stock_consumption sc
                JOIN stock_lot sl ON sl.id = sc.stock_lot_id
                JOIN active_stock_lot_value lv ON lv.stock_lot_id = sl.id
                JOIN sale_delivery_line dl ON dl.id = sc.delivery_line_id
                JOIN sale_delivery sd ON sd.id = dl.delivery_id
                WHERE sd.voided_at IS NULL AND sl.voided_at IS NULL
            ), valued_consumption AS (
                SELECT delivery_line_id, weight,
                       (
                           ROUND(cumulative_weight / original_weight * lot_value_cents, 0)
                           - ROUND((cumulative_weight - weight) / original_weight
                               * lot_value_cents, 0)
                       ) / 100 AS cost
                FROM ordered_consumption
            ), allocation AS (
                SELECT delivery_line_id, SUM(weight) AS allocated_weight,
                       SUM(cost) AS cost
                FROM valued_consumption GROUP BY delivery_line_id
            )
            SELECT dl.id, sd.sale_id, sd.effective_at, l.category_code,
                   c.display_name AS category_name, l.length_cm, dl.weight,
                   l.price_per_gram, dv.revenue_value,
                   COALESCE(a.allocated_weight, 0) AS allocated_weight,
                   COALESCE(a.cost, 0) AS cost
            FROM sale_delivery_line dl
            JOIN sale_delivery sd ON sd.id = dl.delivery_id
            JOIN sale_line l ON l.id = dl.sale_line_id
            JOIN hair_category c ON c.code = l.category_code
            JOIN active_sale_delivery_line_value dv ON dv.delivery_line_id = dl.id
            LEFT JOIN allocation a ON a.delivery_line_id = dl.id
            WHERE sd.voided_at IS NULL
            ORDER BY sd.effective_at, dl.id
            """, (row, number) -> new DeliveredHair(
                (UUID) row.getObject("id"), (UUID) row.getObject("sale_id"),
                row.getTimestamp("effective_at").toInstant(),
                row.getString("category_code"), row.getString("category_name"),
                row.getInt("length_cm"), row.getBigDecimal("weight"),
                row.getBigDecimal("price_per_gram"), row.getBigDecimal("revenue_value"),
                row.getBigDecimal("allocated_weight"), row.getBigDecimal("cost")
            ));
    }

    BigDecimal stockValue() {
        BigDecimal amount = jdbc.queryForObject("""
            SELECT COALESCE(SUM(
                (lv.purchase_value * 100
                - ROUND((original_weight - remaining_weight) / original_weight
                    * (lv.purchase_value * 100), 0)) / 100
            ), 0)
            FROM stock_lot sl
            JOIN active_stock_lot_value lv ON lv.stock_lot_id = sl.id
            WHERE sl.voided_at IS NULL
            """, BigDecimal.class);
        return amount == null ? BigDecimal.ZERO.setScale(2) : amount.setScale(2);
    }

    List<PhysicalStock> physicalStocks() {
        return jdbc.query("""
            SELECT category_code, length_cm, SUM(remaining_weight) AS weight
            FROM stock_lot WHERE voided_at IS NULL
            GROUP BY category_code, length_cm
            """, (row, number) -> new PhysicalStock(row.getString("category_code"),
                row.getInt("length_cm"), row.getBigDecimal("weight")));
    }

    record ReceivedHair(UUID id, Instant effectiveAt, BigDecimal weight,
                        BigDecimal purchaseValue) {}

    record DeliveredHair(UUID id, UUID saleId, Instant effectiveAt,
                         String categoryCode, String categoryName, int lengthCm,
                         BigDecimal weight, BigDecimal pricePerGram, BigDecimal revenueValue,
                         BigDecimal allocatedWeight, BigDecimal cost) {}

    record PhysicalStock(String categoryCode, int lengthCm, BigDecimal weight) {}
}
