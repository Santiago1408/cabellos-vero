package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import bo.lamagiadelcabello.backend.SaleInventoryRepository.HairType;

@Service
class StockAllocationService {

    private final JdbcTemplate jdbc;
    private final SaleInventoryRepository inventory;

    StockAllocationService(JdbcTemplate jdbc, SaleInventoryRepository inventory) {
        this.jdbc = jdbc;
        this.inventory = inventory;
    }

    void rebuild(Collection<HairType> affectedTypes) {
        List<HairType> types = affectedTypes.stream().distinct().sorted().toList();
        inventory.lockTypes(types);
        for (HairType type : types) rebuildType(type);
    }

    private void rebuildType(HairType type) {
        List<MutableLot> lots = jdbc.query("""
            SELECT id, effective_at, original_weight
            FROM stock_lot
            WHERE category_code = ? AND length_cm = ? AND voided_at IS NULL
            ORDER BY effective_at, created_at, id
            FOR UPDATE
            """, (row, number) -> new MutableLot(
                (UUID) row.getObject("id"), row.getTimestamp("effective_at").toInstant(),
                row.getBigDecimal("original_weight")
            ), type.categoryCode(), type.lengthCm());
        List<DeliveredLine> deliveries = jdbc.query("""
            SELECT dl.id, dl.weight, sd.effective_at
            FROM sale_delivery_line dl
            JOIN sale_delivery sd ON sd.id = dl.delivery_id
            JOIN sale_line l ON l.id = dl.sale_line_id
            WHERE l.category_code = ? AND l.length_cm = ? AND sd.voided_at IS NULL
            ORDER BY sd.effective_at, sd.recorded_at, sd.id, dl.id
            """, (row, number) -> new DeliveredLine(
                (UUID) row.getObject("id"), row.getBigDecimal("weight"),
                row.getTimestamp("effective_at").toInstant()
            ), type.categoryCode(), type.lengthCm());

        List<Allocation> allocations = new ArrayList<>();
        for (DeliveredLine delivery : deliveries) {
            BigDecimal needed = delivery.weight();
            for (MutableLot lot : lots) {
                if (needed.signum() == 0 || lot.effectiveAt.isAfter(delivery.effectiveAt())) break;
                if (lot.remaining.signum() == 0) continue;
                BigDecimal taken = needed.min(lot.remaining);
                lot.remaining = lot.remaining.subtract(taken);
                needed = needed.subtract(taken);
                allocations.add(new Allocation(delivery.id(), lot.id, taken));
            }
            if (needed.signum() > 0) {
                throw new AllocationProblem(type, delivery.id(), delivery.effectiveAt(), needed);
            }
        }

        jdbc.update("""
            DELETE FROM stock_consumption sc USING stock_lot sl
            WHERE sc.stock_lot_id = sl.id AND sl.category_code = ? AND sl.length_cm = ?
            """, type.categoryCode(), type.lengthCm());
        for (MutableLot lot : lots) {
            jdbc.update("UPDATE stock_lot SET remaining_weight = ? WHERE id = ?",
                lot.remaining, lot.id);
        }
        for (Allocation allocation : allocations) {
            jdbc.update("""
                INSERT INTO stock_consumption (id, delivery_line_id, stock_lot_id, weight)
                VALUES (?, ?, ?, ?)
                """, UUID.randomUUID(), allocation.deliveryLineId(),
                allocation.stockLotId(), allocation.weight());
        }
    }

    private static final class MutableLot {
        private final UUID id;
        private final Instant effectiveAt;
        private BigDecimal remaining;

        private MutableLot(UUID id, Instant effectiveAt, BigDecimal originalWeight) {
            this.id = id;
            this.effectiveAt = effectiveAt;
            this.remaining = originalWeight;
        }
    }

    private record DeliveredLine(UUID id, BigDecimal weight, Instant effectiveAt) {}
    private record Allocation(UUID deliveryLineId, UUID stockLotId, BigDecimal weight) {}

    static final class AllocationProblem extends RuntimeException {
        private final HairType type;
        private final UUID deliveryLineId;
        private final Instant effectiveAt;
        private final BigDecimal missing;

        AllocationProblem(HairType type, UUID deliveryLineId, Instant effectiveAt,
                          BigDecimal missing) {
            super("Faltan " + missing + " g de " + type.categoryCode() + " "
                + type.lengthCm() + " cm para una entrega del " + effectiveAt + ".");
            this.type = type;
            this.deliveryLineId = deliveryLineId;
            this.effectiveAt = effectiveAt;
            this.missing = missing;
        }

        HairType type() { return type; }
        UUID deliveryLineId() { return deliveryLineId; }
        Instant effectiveAt() { return effectiveAt; }
        BigDecimal missing() { return missing; }
    }
}
