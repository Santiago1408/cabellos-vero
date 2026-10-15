package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import bo.lamagiadelcabello.backend.SaleInventoryRepository.HairType;

@Repository
class InventoryRepository {

    private final JdbcTemplate jdbc;

    InventoryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<InventoryType> typesWithPurchases() {
        return jdbc.query("""
            SELECT DISTINCT l.category_code, c.display_name AS category_name, l.length_cm
            FROM purchase_line l
            JOIN hair_category c ON c.code = l.category_code
            ORDER BY c.display_name, l.length_cm, l.category_code
            """, (row, number) -> new InventoryType(row.getString("category_code"),
                row.getString("category_name"), row.getInt("length_cm")));
    }

    List<Movement> movements(HairType type) {
        List<Movement> incoming = jdbc.query("""
            SELECT rl.id AS movement_id, pr.effective_at, pr.recorded_at,
                   p.id AS operation_id, s.name AS party_name, rl.weight,
                   sl.cost_per_gram AS price_per_gram, lv.purchase_value AS movement_value,
                   sl.id AS stock_lot_id,
                   sl.remaining_weight AS lot_remaining
            FROM stock_lot sl
            JOIN purchase_receipt_line rl ON rl.id = sl.receipt_line_id
            JOIN purchase_receipt pr ON pr.id = rl.receipt_id
            JOIN purchase_order p ON p.id = pr.purchase_id
            JOIN supplier s ON s.id = p.supplier_id
            JOIN active_stock_lot_value lv ON lv.stock_lot_id = sl.id
            WHERE sl.category_code = ? AND sl.length_cm = ?
              AND sl.voided_at IS NULL AND pr.voided_at IS NULL
            """, (row, number) -> new Movement(
                (UUID) row.getObject("movement_id"), "PURCHASE",
                row.getTimestamp("effective_at").toInstant(),
                row.getTimestamp("recorded_at").toInstant(),
                (UUID) row.getObject("operation_id"), row.getString("party_name"),
                row.getBigDecimal("weight"), row.getBigDecimal("price_per_gram"),
                row.getBigDecimal("movement_value"),
                (UUID) row.getObject("stock_lot_id"), row.getBigDecimal("lot_remaining")
            ), type.categoryCode(), type.lengthCm());
        List<Movement> outgoing = jdbc.query("""
            SELECT dl.id AS movement_id, sd.effective_at, sd.recorded_at,
                   s.id AS operation_id, s.customer_name AS party_name, dl.weight,
                   l.price_per_gram, dv.revenue_value AS movement_value
            FROM sale_delivery_line dl
            JOIN sale_delivery sd ON sd.id = dl.delivery_id
            JOIN sale_line l ON l.id = dl.sale_line_id
            JOIN sale_order s ON s.id = sd.sale_id
            JOIN active_sale_delivery_line_value dv ON dv.delivery_line_id = dl.id
            WHERE l.category_code = ? AND l.length_cm = ? AND sd.voided_at IS NULL
            """, (row, number) -> new Movement(
                (UUID) row.getObject("movement_id"), "SALE",
                row.getTimestamp("effective_at").toInstant(),
                row.getTimestamp("recorded_at").toInstant(),
                (UUID) row.getObject("operation_id"), row.getString("party_name"),
                row.getBigDecimal("weight"), row.getBigDecimal("price_per_gram"),
                row.getBigDecimal("movement_value"),
                null, null
            ), type.categoryCode(), type.lengthCm());
        return Stream.concat(incoming.stream(), outgoing.stream())
            .sorted(Comparator.comparing(Movement::effectiveAt)
                .thenComparing(movement -> movement.kind().equals("PURCHASE") ? 0 : 1)
                .thenComparing(Movement::recordedAt)
                .thenComparing(Movement::movementId))
            .toList();
    }

    List<PendingPurchase> pendingPurchases() {
        return jdbc.query("""
            SELECT p.id AS operation_id, p.operation_date, p.created_at,
                   s.id AS supplier_id, s.name AS supplier_name, l.id AS line_id,
                   l.category_code, c.display_name AS category_name, l.length_cm,
                   l.agreed_weight, COALESCE(r.received_weight, 0) AS received_weight,
                   l.agreed_weight - COALESCE(r.received_weight, 0) AS remaining_weight,
                   l.price_per_gram
            FROM purchase_line l
            JOIN purchase_order p ON p.id = l.purchase_id
            JOIN supplier s ON s.id = p.supplier_id
            JOIN hair_category c ON c.code = l.category_code
            LEFT JOIN (
                SELECT rl.purchase_line_id, SUM(rl.weight) AS received_weight
                FROM purchase_receipt_line rl
                JOIN purchase_receipt pr ON pr.id = rl.receipt_id
                WHERE pr.voided_at IS NULL GROUP BY rl.purchase_line_id
            ) r ON r.purchase_line_id = l.id
            WHERE p.status = 'PENDING'
              AND l.agreed_weight > COALESCE(r.received_weight, 0)
            ORDER BY p.operation_date, p.created_at, p.id, l.id
            """, (row, number) -> new PendingPurchase(
                (UUID) row.getObject("operation_id"),
                row.getObject("operation_date", LocalDate.class),
                row.getTimestamp("created_at").toInstant(),
                (UUID) row.getObject("supplier_id"), row.getString("supplier_name"),
                (UUID) row.getObject("line_id"), row.getString("category_code"),
                row.getString("category_name"), row.getInt("length_cm"),
                row.getBigDecimal("agreed_weight"), row.getBigDecimal("received_weight"),
                row.getBigDecimal("remaining_weight"), row.getBigDecimal("price_per_gram")
            ));
    }

    List<ReservedSale> reservedSales() {
        return jdbc.query("""
            SELECT s.id AS operation_id, s.operation_date, s.created_at,
                   s.customer_name, l.id AS line_id, l.category_code,
                   c.display_name AS category_name, l.length_cm, l.agreed_weight,
                   COALESCE(d.delivered_weight, 0) AS delivered_weight,
                   l.agreed_weight - COALESCE(d.delivered_weight, 0) AS remaining_weight,
                   l.price_per_gram
            FROM sale_line l
            JOIN sale_order s ON s.id = l.sale_id
            JOIN hair_category c ON c.code = l.category_code
            LEFT JOIN (
                SELECT dl.sale_line_id, SUM(dl.weight) AS delivered_weight
                FROM sale_delivery_line dl
                JOIN sale_delivery sd ON sd.id = dl.delivery_id
                WHERE sd.voided_at IS NULL GROUP BY dl.sale_line_id
            ) d ON d.sale_line_id = l.id
            WHERE s.status = 'PENDING'
              AND l.agreed_weight > COALESCE(d.delivered_weight, 0)
            ORDER BY s.operation_date, s.created_at, s.id, l.id
            """, (row, number) -> new ReservedSale(
                (UUID) row.getObject("operation_id"),
                row.getObject("operation_date", LocalDate.class),
                row.getTimestamp("created_at").toInstant(),
                row.getString("customer_name"), (UUID) row.getObject("line_id"),
                row.getString("category_code"), row.getString("category_name"),
                row.getInt("length_cm"), row.getBigDecimal("agreed_weight"),
                row.getBigDecimal("delivered_weight"), row.getBigDecimal("remaining_weight"),
                row.getBigDecimal("price_per_gram")
            ));
    }

    record InventoryType(String categoryCode, String categoryName, int lengthCm) {
        HairType hairType() { return new HairType(categoryCode, lengthCm); }
    }

    record Movement(UUID movementId, String kind, Instant effectiveAt, Instant recordedAt,
                    UUID operationId, String partyName, BigDecimal weight,
                    BigDecimal pricePerGram, BigDecimal movementValue,
                    UUID stockLotId, BigDecimal lotRemaining) {}

    record PendingPurchase(UUID operationId, LocalDate operationDate, Instant createdAt,
                           UUID supplierId, String supplierName, UUID lineId,
                           String categoryCode, String categoryName, int lengthCm,
                           BigDecimal agreedWeight, BigDecimal receivedWeight,
                           BigDecimal remainingWeight, BigDecimal pricePerGram) {}

    record ReservedSale(UUID operationId, LocalDate operationDate, Instant createdAt,
                        String customerName, UUID lineId, String categoryCode,
                        String categoryName, int lengthCm, BigDecimal agreedWeight,
                        BigDecimal deliveredWeight, BigDecimal remainingWeight,
                        BigDecimal pricePerGram) {}
}
