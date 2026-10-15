package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;

import bo.lamagiadelcabello.backend.SaleInventoryRepository.HairType;
import bo.lamagiadelcabello.backend.SaleInventoryRepository.StockPosition;
import bo.lamagiadelcabello.backend.SaleRepository.Sale;
import bo.lamagiadelcabello.backend.SaleRepository.SaleLine;

@Service
class SaleService {

    private final SaleRepository sales;
    private final SaleInventoryRepository inventory;
    private final CatalogRepository catalog;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    SaleService(SaleRepository sales, SaleInventoryRepository inventory,
                CatalogRepository catalog, TransactionTemplate transactions, ObjectMapper json) {
        this.sales = sales;
        this.inventory = inventory;
        this.catalog = catalog;
        this.transactions = transactions;
        this.json = json;
    }

    List<Sale> list() { return sales.list(); }

    Sale get(UUID id) {
        return sales.findById(id)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "SALE_NOT_FOUND", "Venta no encontrada."));
    }

    Sale createReservation(CreateInput raw, UUID actorId) {
        CreateInput input = validateCreate(raw);
        String hash = fingerprint(input);
        Sale repeated = sales.findByRequestKey(input.requestKey()).orElse(null);
        if (repeated != null) return sameRequest(repeated, hash);
        try {
            return transactions.execute(status -> {
                Sale duplicate = sales.findByRequestKey(input.requestKey()).orElse(null);
                if (duplicate != null) return sameRequest(duplicate, hash);
                Set<String> categories = catalog.categories().stream()
                    .map(CatalogRepository.Category::code).collect(Collectors.toSet());
                Set<Integer> lengths = catalog.lengths().stream()
                    .map(CatalogRepository.Length::centimeters).collect(Collectors.toSet());
                Map<HairType, BigDecimal> requested = new TreeMap<>();
                for (LineInput line : input.lines()) {
                    if (!categories.contains(line.categoryCode()) || !lengths.contains(line.lengthCm())) {
                        throw problem(HttpStatus.BAD_REQUEST, "INVALID_HAIR_TYPE",
                            "Alguna categoría o longitud seleccionada ya no existe.");
                    }
                    requested.merge(new HairType(line.categoryCode(), line.lengthCm()),
                        line.weight(), BigDecimal::add);
                }
                inventory.lockTypes(requested.keySet());
                requireAvailability(requested, Map.of(), input.acceptPendingStock());

                UUID saleId = UUID.randomUUID();
                sales.create(saleId, input.requestKey(), hash, input.customerName(),
                    input.operationDate(), input.acceptPendingStock());
                for (LineInput line : input.lines()) {
                    sales.addLine(UUID.randomUUID(), saleId, line.categoryCode(),
                        line.lengthCm(), line.weight(), line.pricePerGram());
                }
                sales.addHistory(saleId, "SALE_RESERVED", actorId, null,
                    null, snapshotJson(saleId));
                return get(saleId);
            });
        } catch (DataIntegrityViolationException conflict) {
            Sale duplicate = sales.findByRequestKey(input.requestKey()).orElse(null);
            if (duplicate != null) return sameRequest(duplicate, hash);
            throw problem(HttpStatus.CONFLICT, "SALE_CONFLICT",
                "El catálogo o las reservas cambiaron durante el registro. Vuelve a consultar los datos.");
        }
    }

    Sale edit(UUID saleId, EditInput raw, UUID actorId) {
        EditInput input = validateEdit(raw);
        try {
            return transactions.execute(status -> {
                Sale before = sales.findByIdForUpdate(saleId)
                    .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "SALE_NOT_FOUND",
                        "Venta no encontrada."));
                if (before.version() != input.expectedVersion()) {
                    throw problem(HttpStatus.CONFLICT, "SALE_VERSION_CONFLICT",
                        "La venta cambió desde que la abriste. Recarga el detalle antes de editar.");
                }
                if (!before.status().equals("PENDING")) {
                    throw problem(HttpStatus.CONFLICT, "SALE_NOT_PENDING",
                        "Solo se puede editar una venta pendiente.");
                }
                List<SaleLine> oldLines = sales.lines(saleId);
                Map<UUID, SaleLine> oldById = new HashMap<>();
                Map<HairType, BigDecimal> ownReserved = new TreeMap<>();
                for (SaleLine line : oldLines) {
                    oldById.put(line.id(), line);
                    ownReserved.merge(new HairType(line.categoryCode(), line.lengthCm()),
                        line.agreedWeight(), BigDecimal::add);
                }
                Set<UUID> suppliedIds = new HashSet<>();
                Map<HairType, BigDecimal> requested = new TreeMap<>();
                for (EditLineInput line : input.lines()) {
                    if (line.id() != null && (!suppliedIds.add(line.id())
                        || !oldById.containsKey(line.id()))) {
                        throw problem(HttpStatus.BAD_REQUEST, "INVALID_LINE",
                            "Una línea está duplicada o no pertenece a esta venta.");
                    }
                    requested.merge(new HairType(line.categoryCode(), line.lengthCm()),
                        line.weight(), BigDecimal::add);
                }
                Set<HairType> affected = new HashSet<>(ownReserved.keySet());
                affected.addAll(requested.keySet());
                inventory.lockTypes(affected);
                validateCatalog(requested.keySet());
                requireAvailability(requested, ownReserved, input.acceptPendingStock());

                boolean changed = !before.customerName().equals(input.customerName())
                    || !before.operationDate().equals(input.operationDate())
                    || before.acceptedPendingStock() != input.acceptPendingStock();
                for (SaleLine old : oldLines) {
                    if (suppliedIds.contains(old.id())) continue;
                    sales.deleteLine(old.id());
                    changed = true;
                }
                for (EditLineInput line : input.lines()) {
                    if (line.id() == null) {
                        sales.addLine(UUID.randomUUID(), saleId, line.categoryCode(),
                            line.lengthCm(), line.weight(), line.pricePerGram());
                        changed = true;
                        continue;
                    }
                    SaleLine old = oldById.get(line.id());
                    if (old.categoryCode().equals(line.categoryCode())
                        && old.lengthCm() == line.lengthCm()
                        && old.agreedWeight().compareTo(line.weight()) == 0
                        && old.pricePerGram().compareTo(line.pricePerGram()) == 0) continue;
                    sales.updateLine(line.id(), line.categoryCode(), line.lengthCm(),
                        line.weight(), line.pricePerGram());
                    changed = true;
                }
                if (!changed) {
                    throw problem(HttpStatus.BAD_REQUEST, "NO_CHANGES", "No hay cambios en la venta.");
                }
                String oldValues = snapshotJson(before, oldLines);
                sales.updateHeader(saleId, input.customerName(), input.operationDate(),
                    input.acceptPendingStock());
                sales.touch(saleId);
                Sale after = get(saleId);
                sales.addHistory(saleId, "SALE_UPDATED", actorId, input.reason(),
                    oldValues, snapshotJson(after, sales.lines(saleId)));
                return after;
            });
        } catch (DataIntegrityViolationException conflict) {
            throw problem(HttpStatus.CONFLICT, "SALE_CONFLICT",
                "El catálogo cambió durante la edición. Vuelve a consultar los datos.");
        }
    }

    Sale cancel(UUID saleId, String rawReason, UUID actorId) {
        String reason = validateReason(rawReason);
        return transactions.execute(status -> {
            Sale before = sales.findByIdForUpdate(saleId)
                .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "SALE_NOT_FOUND", "Venta no encontrada."));
            if (!before.status().equals("PENDING")) {
                throw problem(HttpStatus.CONFLICT, "SALE_NOT_PENDING",
                    "Solo se puede anular el saldo de una venta pendiente.");
            }
            List<SaleLine> lines = sales.lines(saleId);
            inventory.lockTypes(lines.stream()
                .map(line -> new HairType(line.categoryCode(), line.lengthCm())).toList());
            String oldValues = snapshotJson(before, lines);
            sales.cancel(saleId);
            Sale after = get(saleId);
            sales.addHistory(saleId, "SALE_CANCELED", actorId, reason,
                oldValues, snapshotJson(after, lines));
            return after;
        });
    }

    private Sale sameRequest(Sale existing, String hash) {
        if (!existing.requestHash().equals(hash)) {
            throw problem(HttpStatus.CONFLICT, "REQUEST_KEY_REUSED",
                "La clave de solicitud ya se usó con otros datos.");
        }
        return existing;
    }

    private void validateCatalog(Set<HairType> types) {
        Set<String> categories = catalog.categories().stream()
            .map(CatalogRepository.Category::code).collect(Collectors.toSet());
        Set<Integer> lengths = catalog.lengths().stream()
            .map(CatalogRepository.Length::centimeters).collect(Collectors.toSet());
        for (HairType type : types) {
            if (!categories.contains(type.categoryCode()) || !lengths.contains(type.lengthCm())) {
                throw problem(HttpStatus.BAD_REQUEST, "INVALID_HAIR_TYPE",
                    "Alguna categoría o longitud seleccionada ya no existe.");
            }
        }
    }

    private void requireAvailability(Map<HairType, BigDecimal> requested,
                                     Map<HairType, BigDecimal> ownReserved,
                                     boolean acceptPendingStock) {
        List<AvailabilityIssue> shortages = new ArrayList<>();
        List<AvailabilityIssue> needsPending = new ArrayList<>();
        for (var entry : requested.entrySet()) {
            HairType type = entry.getKey();
            BigDecimal weight = entry.getValue();
            StockPosition position = inventory.position(type);
            BigDecimal otherReserved = position.reserved()
                .subtract(ownReserved.getOrDefault(type, BigDecimal.ZERO));
            if (otherReserved.signum() < 0) {
                throw problem(HttpStatus.CONFLICT, "INVALID_RESERVATIONS",
                    "Las reservas cambiaron. Recarga la venta antes de continuar.");
            }
            BigDecimal freePhysical = position.physical().subtract(otherReserved)
                .max(BigDecimal.ZERO);
            BigDecimal freePending = position.pending()
                .subtract(otherReserved.subtract(position.physical()).max(BigDecimal.ZERO))
                .max(BigDecimal.ZERO);
            BigDecimal missing = weight.subtract(position.physical())
                .subtract(position.pending()).add(otherReserved).max(BigDecimal.ZERO);
            AvailabilityIssue issue = new AvailabilityIssue(type.categoryCode(), type.lengthCm(),
                weight, freePhysical, freePending, missing);
            if (missing.signum() > 0) shortages.add(issue);
            else if (weight.compareTo(freePhysical) > 0) needsPending.add(issue);
        }
        if (!shortages.isEmpty()) {
            throw new SaleProblem(HttpStatus.CONFLICT, "INSUFFICIENT_HAIR",
                "La venta completa se rechazó: falta cabello en uno o más tipos.", shortages);
        }
        if (!needsPending.isEmpty() && !acceptPendingStock) {
            throw new SaleProblem(HttpStatus.CONFLICT, "PENDING_STOCK_CONFIRMATION_REQUIRED",
                "Se necesita cabello pendiente de recibir. Confirma si quieres reservarlo.",
                needsPending);
        }
    }

    private CreateInput validateCreate(CreateInput raw) {
        if (raw == null || raw.requestKey() == null || raw.operationDate() == null
            || raw.lines() == null || raw.lines().isEmpty() || raw.lines().size() > 100) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_SALE",
                "Indica clave de solicitud, fecha y entre 1 y 100 líneas de venta.");
        }
        String customer = raw.customerName() == null ? "" : raw.customerName().trim();
        if (customer.isEmpty() || customer.length() > 200) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_CUSTOMER",
                "El nombre del cliente debe tener entre 1 y 200 caracteres.");
        }
        List<LineInput> lines = raw.lines().stream().map(line -> {
            if (line == null || line.categoryCode() == null || line.categoryCode().isBlank()
                || line.lengthCm() == null || line.lengthCm() <= 0) {
                throw problem(HttpStatus.BAD_REQUEST, "INVALID_LINE",
                    "Cada línea necesita categoría y longitud válidas.");
            }
            return new LineInput(line.categoryCode(), line.lengthCm(),
                positiveTwoDecimals(line.weight(), "peso"),
                positiveTwoDecimals(line.pricePerGram(), "precio por gramo"));
        }).toList();
        return new CreateInput(raw.requestKey(), customer, raw.operationDate(), lines,
            raw.acceptPendingStock());
    }

    private EditInput validateEdit(EditInput raw) {
        if (raw == null || raw.expectedVersion() == null || raw.expectedVersion() < 0
            || raw.operationDate() == null || raw.lines() == null || raw.lines().isEmpty()
            || raw.lines().size() > 100) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_SALE",
                "Indica versión, fecha y entre 1 y 100 líneas de venta.");
        }
        String customer = raw.customerName() == null ? "" : raw.customerName().trim();
        if (customer.isEmpty() || customer.length() > 200) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_CUSTOMER",
                "El nombre del cliente debe tener entre 1 y 200 caracteres.");
        }
        String reason = validateReason(raw.reason());
        List<EditLineInput> lines = raw.lines().stream().map(line -> {
            if (line == null || line.categoryCode() == null || line.categoryCode().isBlank()
                || line.lengthCm() == null || line.lengthCm() <= 0) {
                throw problem(HttpStatus.BAD_REQUEST, "INVALID_LINE",
                    "Cada línea necesita categoría y longitud válidas.");
            }
            return new EditLineInput(line.id(), line.categoryCode(), line.lengthCm(),
                positiveTwoDecimals(line.weight(), "peso"),
                positiveTwoDecimals(line.pricePerGram(), "precio por gramo"));
        }).toList();
        return new EditInput(raw.expectedVersion(), customer, raw.operationDate(), lines,
            raw.acceptPendingStock(), reason);
    }

    private static BigDecimal positiveTwoDecimals(BigDecimal value, String label) {
        if (value == null || value.signum() <= 0 || value.scale() > 2
            || value.precision() - value.scale() > 12) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_AMOUNT",
                "El " + label + " debe ser positivo y tener como máximo dos decimales.");
        }
        return value.setScale(2, RoundingMode.UNNECESSARY);
    }

    private static String validateReason(String raw) {
        String reason = raw == null ? "" : raw.trim();
        if (reason.isEmpty() || reason.length() > 500) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_REASON",
                "Indica un motivo de 1 a 500 caracteres.");
        }
        return reason;
    }

    private String snapshotJson(UUID saleId) {
        return snapshotJson(get(saleId), sales.lines(saleId));
    }

    private String snapshotJson(Sale sale, List<SaleLine> lines) {
        return json.writeValueAsString(Map.of(
            "customerName", sale.customerName(),
            "operationDate", sale.operationDate().toString(),
            "acceptedPendingStock", sale.acceptedPendingStock(),
            "status", sale.status(),
            "lines", lines.stream().map(line -> Map.of(
                "lineId", line.id().toString(),
                "categoryCode", line.categoryCode(),
                "lengthCm", line.lengthCm(),
                "agreedWeight", line.agreedWeight(),
                "pricePerGram", line.pricePerGram()
            )).toList()
        ));
    }

    private String fingerprint(Object value) {
        try {
            byte[] bytes = json.writeValueAsBytes(value);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 no está disponible.", impossible);
        }
    }

    private static SaleProblem problem(HttpStatus status, String code, String message) {
        return new SaleProblem(status, code, message, List.of());
    }

    record LineInput(String categoryCode, Integer lengthCm, BigDecimal weight, BigDecimal pricePerGram) {}
    record CreateInput(UUID requestKey, String customerName, LocalDate operationDate,
                       List<LineInput> lines, boolean acceptPendingStock) {}
    record EditLineInput(UUID id, String categoryCode, Integer lengthCm,
                         BigDecimal weight, BigDecimal pricePerGram) {}
    record EditInput(Long expectedVersion, String customerName, LocalDate operationDate,
                     List<EditLineInput> lines, boolean acceptPendingStock, String reason) {}
    record AvailabilityIssue(String categoryCode, int lengthCm, BigDecimal requested,
                             BigDecimal physicalAvailable, BigDecimal pendingAvailable,
                             BigDecimal missing) {}

    static final class SaleProblem extends RuntimeException {
        private final HttpStatus status;
        private final String code;
        private final List<AvailabilityIssue> issues;

        SaleProblem(HttpStatus status, String code, String message,
                    List<AvailabilityIssue> issues) {
            super(message);
            this.status = status;
            this.code = code;
            this.issues = issues;
        }

        HttpStatus status() { return status; }
        String code() { return code; }
        List<AvailabilityIssue> issues() { return issues; }
    }
}
