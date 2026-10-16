package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.ObjectMapper;

import bo.lamagiadelcabello.backend.SaleInventoryRepository.HairType;

@Service
class InventoryOpeningService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/La_Paz");
    private static final BigDecimal ZERO = new BigDecimal("0.00");

    private final JdbcTemplate jdbc;
    private final CatalogRepository catalog;
    private final SaleInventoryRepository positions;
    private final StockAllocationService allocations;
    private final ObjectMapper json;

    InventoryOpeningService(JdbcTemplate jdbc, CatalogRepository catalog,
                            SaleInventoryRepository positions,
                            StockAllocationService allocations, ObjectMapper json) {
        this.jdbc = jdbc;
        this.catalog = catalog;
        this.positions = positions;
        this.allocations = allocations;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public OpeningView get() {
        List<OpeningHeader> headers = jdbc.query("""
            SELECT id, cutoff_at, created_at, version, actor_user_id FROM inventory_opening
            """, (row, number) -> new OpeningHeader(
                (UUID) row.getObject("id"), row.getTimestamp("cutoff_at").toInstant(),
                row.getTimestamp("created_at").toInstant(), row.getLong("version"),
                (UUID) row.getObject("actor_user_id")));
        if (headers.isEmpty()) return null;
        OpeningHeader header = headers.getFirst();
        List<OpeningLot> lots = lots(header.id());
        List<OpeningHistory> history = jdbc.query("""
            SELECT id, changed_at, actor_user_id, reason,
                   old_values::text AS old_values, new_values::text AS new_values
            FROM inventory_opening_history WHERE opening_id = ?
            ORDER BY changed_at DESC, id DESC
            """, (row, number) -> new OpeningHistory(row.getLong("id"),
                row.getTimestamp("changed_at").toInstant(),
                (UUID) row.getObject("actor_user_id"), row.getString("reason"),
                row.getString("old_values"), row.getString("new_values")), header.id());
        return new OpeningView(header, lots, history, totals(lots));
    }

    @Transactional(readOnly = true)
    public Preview preview(CreateInput input) {
        Validated validated = validate(input, false);
        OpeningView current = get();
        if (current != null && !validated.cutoffAt().equals(current.header().cutoffAt())) {
            requireCutoffBeforeOperations(validated.cutoffAt());
        }
        if (current == null
            && (jdbc.queryForObject("SELECT count(*) FROM purchase_order", Integer.class) > 0
                || jdbc.queryForObject("SELECT count(*) FROM sale_order", Integer.class) > 0)) {
            throw problem(HttpStatus.CONFLICT,
                "La apertura debe registrarse antes de la primera compra o venta de esta base.");
        }
        return new Preview(validated.cutoffAt(), validated.lots().size(),
            validated.lots().stream().map(LotInput::weight).reduce(ZERO, BigDecimal::add),
            validated.lots().stream().map(lot -> PurchaseService.lineTotal(
                lot.weight(), lot.costPerGram())).reduce(ZERO, BigDecimal::add),
            validated.lots().stream().filter(LotInput::costEstimated).count());
    }

    @Transactional
    public OpeningView create(CreateInput input, UUID actorId) {
        Validated validated = validate(input, false);
        lockOperations();
        positions.lockTypes(validated.lots().stream().map(lot ->
            new HairType(lot.categoryCode(), lot.lengthCm())).toList());
        if (jdbc.queryForObject("SELECT count(*) FROM inventory_opening", Integer.class) > 0) {
            throw problem(HttpStatus.CONFLICT, "La apertura de inventario ya existe.");
        }
        if (jdbc.queryForObject("SELECT count(*) FROM purchase_order", Integer.class) > 0
            || jdbc.queryForObject("SELECT count(*) FROM sale_order", Integer.class) > 0) {
            throw problem(HttpStatus.CONFLICT,
                "Registra la apertura antes de crear compras o ventas. Esta base ya tiene operaciones.");
        }
        UUID openingId = UUID.randomUUID();
        jdbc.update("""
            INSERT INTO inventory_opening (id, cutoff_at, actor_user_id) VALUES (?, ?, ?)
            """, openingId, java.sql.Timestamp.from(validated.cutoffAt()), actorId);
        for (LotInput lot : validated.lots()) insertLot(openingId, validated.cutoffAt(), lot);
        OpeningView result = get();
        history(openingId, actorId, null, null, snapshot(result));
        return get();
    }

    @Transactional
    public OpeningView correct(CorrectionInput input, UUID actorId) {
        OpeningView previous = get();
        if (previous == null) throw problem(HttpStatus.NOT_FOUND, "No existe una apertura de inventario.");
        if (input == null || input.reason() == null || input.reason().trim().length() < 3
            || input.reason().trim().length() > 500) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica un motivo de 3 a 500 caracteres.");
        }
        Validated validated = validate(new CreateInput(input.cutoffAt(), input.lots()), true);
        Map<UUID, OpeningLot> oldById = previous.lots().stream()
            .collect(Collectors.toMap(OpeningLot::id, lot -> lot));
        Set<UUID> seen = new HashSet<>();
        for (LotInput lot : validated.lots()) {
            if (lot.id() != null && (!oldById.containsKey(lot.id()) || !seen.add(lot.id()))) {
                throw problem(HttpStatus.BAD_REQUEST,
                    "La corrección contiene un lote inexistente o repetido.");
            }
        }
        List<HairType> types = new ArrayList<>();
        previous.lots().forEach(lot -> types.add(new HairType(lot.categoryCode(), lot.lengthCm())));
        validated.lots().forEach(lot -> types.add(new HairType(lot.categoryCode(), lot.lengthCm())));
        lockOperations();
        positions.lockTypes(types);
        jdbc.query("SELECT id FROM inventory_opening WHERE id = ? FOR UPDATE",
            row -> {}, previous.header().id());
        Long currentVersion = jdbc.queryForObject("""
            SELECT version FROM inventory_opening WHERE id = ?
            """, Long.class, previous.header().id());
        if (input.expectedVersion() == null || !input.expectedVersion().equals(currentVersion)) {
            throw problem(HttpStatus.CONFLICT,
                "La apertura cambió mientras la editabas. Recarga el detalle antes de corregirla.");
        }
        previous = get();
        if (!validated.cutoffAt().equals(previous.header().cutoffAt())) {
            requireCutoffBeforeOperations(validated.cutoffAt());
        }
        jdbc.update("""
            DELETE FROM stock_consumption c USING stock_lot l
            WHERE c.stock_lot_id = l.id AND l.opening_id = ?
            """, previous.header().id());
        for (OpeningLot old : previous.lots()) {
            if (!seen.contains(old.id())) {
                jdbc.update("DELETE FROM stock_lot WHERE id = ?", old.id());
            }
        }
        for (LotInput lot : validated.lots()) {
            if (lot.id() == null) insertLot(previous.header().id(), validated.cutoffAt(), lot);
            else jdbc.update("""
                UPDATE stock_lot SET category_code = ?, length_cm = ?,
                    cost_per_gram = ?, original_weight = ?, remaining_weight = ?,
                    opening_order = ?, origin_date = ?, cost_estimated = ?, opening_note = ?,
                    effective_at = ?
                WHERE id = ? AND opening_id = ?
                """, lot.categoryCode(), lot.lengthCm(), lot.costPerGram(), lot.weight(),
                lot.weight(), lot.order(), lot.originDate(), lot.costEstimated(), lot.note(),
                java.sql.Timestamp.from(validated.cutoffAt()), lot.id(), previous.header().id());
        }
        jdbc.update("UPDATE inventory_opening SET cutoff_at = ? WHERE id = ?",
            java.sql.Timestamp.from(validated.cutoffAt()), previous.header().id());
        try {
            allocations.rebuild(types);
        } catch (StockAllocationService.AllocationProblem impossible) {
            throw problem(HttpStatus.CONFLICT, impossible.getMessage());
        }
        var shortages = positions.backingShortages(types);
        if (!shortages.isEmpty()) {
            var first = shortages.getFirst();
            throw problem(HttpStatus.CONFLICT, "La corrección dejaría una reserva sin respaldo: faltan "
                + first.missing() + " g de " + first.type().categoryCode() + " "
                + first.type().lengthCm() + " cm.");
        }
        jdbc.update("UPDATE inventory_opening SET version = version + 1 WHERE id = ?",
            previous.header().id());
        OpeningView changed = get();
        history(previous.header().id(), actorId, input.reason().trim(),
            snapshot(previous), snapshot(changed));
        return get();
    }

    private Validated validate(CreateInput input, boolean correction) {
        if (input == null || input.cutoffAt() == null || input.lots() == null
            || input.lots().isEmpty() || input.lots().size() > 1000) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Indica fecha y hora de apertura y entre 1 y 1000 lotes.");
        }
        Instant cutoff = input.cutoffAt().toInstant();
        if (cutoff.isAfter(Instant.now())) {
            throw problem(HttpStatus.BAD_REQUEST, "La apertura no puede tener fecha futura.");
        }
        LocalDate cutoffDate = cutoff.atZone(BUSINESS_ZONE).toLocalDate();
        Set<String> categories = catalog.categories().stream()
            .map(CatalogRepository.Category::code).collect(Collectors.toSet());
        Set<Integer> lengths = catalog.lengths().stream()
            .map(CatalogRepository.Length::centimeters).collect(Collectors.toSet());
        Set<Integer> orders = new HashSet<>();
        for (LotInput lot : input.lots()) {
            if (lot == null || lot.order() == null || lot.order() <= 0
                || !orders.add(lot.order()) || !categories.contains(lot.categoryCode())
                || !lengths.contains(lot.lengthCm())
                || !positiveTwoDecimals(lot.weight()) || !positiveTwoDecimals(lot.costPerGram())
                || lot.costEstimated() == null
                || (lot.originDate() != null && lot.originDate().isAfter(cutoffDate))
                || (lot.note() != null && lot.note().length() > 300)
                || (!correction && lot.id() != null)) {
                throw problem(HttpStatus.BAD_REQUEST,
                    "Revisa tipos, orden único, fechas, peso y costo de cada lote (máximo dos decimales).");
            }
        }
        return new Validated(cutoff, input.lots());
    }

    private static boolean positiveTwoDecimals(BigDecimal value) {
        return value != null && value.signum() > 0 && value.scale() <= 2
            && value.precision() - value.scale() <= 12;
    }

    private void insertLot(UUID openingId, Instant cutoff, LotInput lot) {
        jdbc.update("""
            INSERT INTO stock_lot (id, opening_id, category_code, length_cm,
                cost_per_gram, original_weight, remaining_weight, effective_at,
                opening_order, origin_date, cost_estimated, opening_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, UUID.randomUUID(), openingId, lot.categoryCode(), lot.lengthCm(),
            lot.costPerGram(), lot.weight(), lot.weight(), java.sql.Timestamp.from(cutoff),
            lot.order(), lot.originDate(), lot.costEstimated(), lot.note());
    }

    private List<OpeningLot> lots(UUID openingId) {
        return jdbc.query("""
            SELECT id, category_code, length_cm, original_weight, remaining_weight,
                   cost_per_gram, opening_order, origin_date, cost_estimated, opening_note
            FROM stock_lot WHERE opening_id = ? ORDER BY opening_order, id
            """, (row, number) -> new OpeningLot((UUID) row.getObject("id"),
                row.getString("category_code"), row.getInt("length_cm"),
                row.getBigDecimal("original_weight"), row.getBigDecimal("remaining_weight"),
                row.getBigDecimal("cost_per_gram"), row.getInt("opening_order"),
                row.getObject("origin_date", LocalDate.class),
                row.getBoolean("cost_estimated"), row.getString("opening_note")), openingId);
    }

    private static Totals totals(List<OpeningLot> lots) {
        return new Totals(lots.stream().map(OpeningLot::originalWeight)
            .reduce(ZERO, BigDecimal::add), lots.stream().map(lot ->
            PurchaseService.lineTotal(lot.originalWeight(), lot.costPerGram()))
            .reduce(ZERO, BigDecimal::add));
    }

    private void history(UUID openingId, UUID actorId, String reason,
                         Object oldValues, Object newValues) {
        jdbc.update("""
            INSERT INTO inventory_opening_history
                (opening_id, actor_user_id, reason, old_values, new_values)
            VALUES (?, ?, ?, ?::jsonb, ?::jsonb)
            """, openingId, actorId, reason,
            oldValues == null ? null : json.writeValueAsString(oldValues),
            newValues == null ? null : json.writeValueAsString(newValues));
    }

    private static Object snapshot(OpeningView opening) {
        return Map.of("cutoffAt", opening.header().cutoffAt().toString(),
            "lots", opening.lots());
    }

    private void requireCutoffBeforeOperations(Instant cutoff) {
        LocalDate cutoffDate = cutoff.atZone(BUSINESS_ZONE).toLocalDate();
        Long earlier = jdbc.queryForObject("""
            SELECT (SELECT count(*) FROM purchase_order WHERE operation_date < ?)
                 + (SELECT count(*) FROM sale_order WHERE operation_date < ?)
                 + (SELECT count(*) FROM purchase_receipt WHERE effective_at <= ?)
                 + (SELECT count(*) FROM sale_delivery WHERE effective_at <= ?)
            """, Long.class, cutoffDate, cutoffDate,
            java.sql.Timestamp.from(cutoff), java.sql.Timestamp.from(cutoff));
        if (earlier != null && earlier > 0) {
            throw problem(HttpStatus.CONFLICT,
                "La nueva fecha de corte debe ser anterior a todas las compras, ventas, recepciones y entregas registradas.");
        }
    }

    private void lockOperations() {
        jdbc.execute("LOCK TABLE purchase_order, sale_order, stock_lot, stock_consumption "
            + "IN SHARE ROW EXCLUSIVE MODE");
    }

    private static OpeningProblem problem(HttpStatus status, String message) {
        return new OpeningProblem(status, message);
    }

    record CreateInput(OffsetDateTime cutoffAt, List<LotInput> lots) {}
    record CorrectionInput(Long expectedVersion, String reason,
                           OffsetDateTime cutoffAt, List<LotInput> lots) {}
    record LotInput(UUID id, String categoryCode, int lengthCm, Integer order,
                    BigDecimal weight, BigDecimal costPerGram, Boolean costEstimated,
                    LocalDate originDate, String note) {}
    record Validated(Instant cutoffAt, List<LotInput> lots) {}
    record Preview(Instant cutoffAt, int lotCount, BigDecimal totalWeight,
                   BigDecimal totalValue, long estimatedCostLots) {}
    record OpeningHeader(UUID id, Instant cutoffAt, Instant createdAt,
                         long version, UUID actorUserId) {}
    record OpeningLot(UUID id, String categoryCode, int lengthCm,
                      BigDecimal originalWeight, BigDecimal remainingWeight,
                      BigDecimal costPerGram, int order, LocalDate originDate,
                      boolean costEstimated, String note) {}
    record OpeningHistory(long id, Instant changedAt, UUID actorUserId,
                          String reason, String oldValues, String newValues) {}
    record Totals(BigDecimal weight, BigDecimal value) {}
    record OpeningView(OpeningHeader header, List<OpeningLot> lots,
                       List<OpeningHistory> history, Totals totals) {}

    static final class OpeningProblem extends RuntimeException {
        private final HttpStatus status;
        OpeningProblem(HttpStatus status, String message) {
            super(message);
            this.status = status;
        }
        HttpStatus status() { return status; }
    }
}
