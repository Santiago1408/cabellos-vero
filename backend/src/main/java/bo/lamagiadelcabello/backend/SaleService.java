package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.Instant;
import java.time.OffsetDateTime;
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
import bo.lamagiadelcabello.backend.SaleRepository.Delivery;
import bo.lamagiadelcabello.backend.SaleRepository.DeliveryItem;

@Service
class SaleService {

    private final SaleRepository sales;
    private final SaleInventoryRepository inventory;
    private final CatalogRepository catalog;
    private final StockAllocationService allocation;
    private final SalePaymentRepository payments;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    SaleService(SaleRepository sales, SaleInventoryRepository inventory,
                CatalogRepository catalog, StockAllocationService allocation,
                SalePaymentRepository payments,
                TransactionTemplate transactions, ObjectMapper json) {
        this.sales = sales;
        this.inventory = inventory;
        this.catalog = catalog;
        this.allocation = allocation;
        this.payments = payments;
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

    Sale createImmediate(ImmediateInput raw, UUID actorId) {
        if (raw == null || raw.effectiveAt() == null) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_SALE",
                "Indica la fecha y hora real de entrega para una venta inmediata.");
        }
        CreateInput sale = validateCreate(new CreateInput(raw.requestKey(), raw.customerName(),
            raw.operationDate(), raw.lines(), false));
        if (raw.effectiveAt().toInstant().isAfter(Instant.now().plusSeconds(300))) {
            throw problem(HttpStatus.BAD_REQUEST, "FUTURE_DELIVERY",
                "La hora real de entrega no puede estar en el futuro.");
        }
        UUID reservationKey = UUID.nameUUIDFromBytes(
            (sale.requestKey() + ":immediate-sale").getBytes(StandardCharsets.UTF_8));
        UUID deliveryKey = UUID.nameUUIDFromBytes(
            (sale.requestKey() + ":immediate-delivery").getBytes(StandardCharsets.UTF_8));
        return transactions.execute(status -> {
            Sale reserved = createReservation(new CreateInput(reservationKey,
                sale.customerName(), sale.operationDate(), sale.lines(), false), actorId);
            List<DeliveryItemInput> items = sales.lines(reserved.id()).stream()
                .map(line -> new DeliveryItemInput(line.id(), line.agreedWeight())).toList();
            return deliver(reserved.id(), new DeliveryInput(deliveryKey,
                raw.effectiveAt(), items), actorId);
        });
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
                boolean confirmed = before.status().equals("CONFIRMED");
                if (!before.status().equals("PENDING") && !confirmed) {
                    throw problem(HttpStatus.CONFLICT, "SALE_CANCELED",
                        "No se puede editar una venta anulada.");
                }
                if (confirmed && before.acceptedPendingStock() != input.acceptPendingStock()) {
                    throw problem(HttpStatus.CONFLICT, "CONFIRMED_SALE_IMMUTABLE",
                        "No puedes cambiar la aceptación de stock pendiente de una venta confirmada.");
                }
                List<SaleLine> oldLines = sales.lines(saleId);
                Map<UUID, SaleLine> oldById = new HashMap<>();
                Map<HairType, BigDecimal> ownReserved = new TreeMap<>();
                for (SaleLine line : oldLines) {
                    oldById.put(line.id(), line);
                    ownReserved.merge(new HairType(line.categoryCode(), line.lengthCm()),
                        line.agreedWeight().subtract(line.deliveredWeight()), BigDecimal::add);
                }
                Set<UUID> suppliedIds = new HashSet<>();
                Map<HairType, BigDecimal> requested = new TreeMap<>();
                for (EditLineInput line : input.lines()) {
                    if (confirmed && line.id() == null) {
                        throw problem(HttpStatus.CONFLICT, "CONFIRMED_SALE_IMMUTABLE",
                            "No puedes agregar líneas a una venta confirmada.");
                    }
                    if (line.id() != null && (!suppliedIds.add(line.id())
                        || !oldById.containsKey(line.id()))) {
                        throw problem(HttpStatus.BAD_REQUEST, "INVALID_LINE",
                            "Una línea está duplicada o no pertenece a esta venta.");
                    }
                    SaleLine original = line.id() == null ? null : oldById.get(line.id());
                    if (confirmed && (original == null
                        || !original.categoryCode().equals(line.categoryCode())
                        || original.lengthCm() != line.lengthCm()
                        || original.agreedWeight().compareTo(line.weight()) != 0)) {
                        throw problem(HttpStatus.CONFLICT, "CONFIRMED_SALE_IMMUTABLE",
                            "Solo puedes corregir datos generales y precios en una venta confirmada.");
                    }
                    if (original != null && original.deliveredWeight().signum() > 0) {
                        if (!original.categoryCode().equals(line.categoryCode())
                            || original.lengthCm() != line.lengthCm()
                            || line.weight().compareTo(original.deliveredWeight()) < 0) {
                            throw problem(HttpStatus.CONFLICT, "DELIVERED_LINE_IMMUTABLE",
                                "No puedes cambiar el tipo ni reducir el peso por debajo de lo ya entregado.");
                        }
                    }
                    requested.merge(new HairType(line.categoryCode(), line.lengthCm()),
                        line.weight().subtract(original == null ? BigDecimal.ZERO
                            : original.deliveredWeight()), BigDecimal::add);
                }
                for (SaleLine old : oldLines) {
                    if (confirmed && !suppliedIds.contains(old.id())) {
                        throw problem(HttpStatus.CONFLICT, "CONFIRMED_SALE_IMMUTABLE",
                            "No puedes quitar líneas de una venta confirmada.");
                    }
                    if (!suppliedIds.contains(old.id()) && old.deliveredWeight().signum() > 0) {
                        throw problem(HttpStatus.CONFLICT, "DELIVERED_LINE_IMMUTABLE",
                            "No puedes quitar una línea con cabello ya entregado.");
                    }
                }
                Set<HairType> affected = new HashSet<>(ownReserved.keySet());
                affected.addAll(requested.keySet());
                inventory.lockTypes(affected);
                validateCatalog(requested.keySet());
                if (!confirmed) {
                    requireAvailability(requested, ownReserved, input.acceptPendingStock());
                }

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
                SalePaymentService.requireWithinPayable(payments.totalActive(saleId),
                    SalePaymentService.payableTotal(before, sales.lines(saleId)));
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
            SalePaymentService.requireWithinPayable(payments.totalActive(saleId),
                SalePaymentService.payableTotal(after, lines));
            sales.addHistory(saleId, "SALE_CANCELED", actorId, reason,
                oldValues, snapshotJson(after, lines));
            return after;
        });
    }

    Sale deliver(UUID saleId, DeliveryInput raw, UUID actorId) {
        DeliveryInput input = validateDelivery(raw);
        String hash = fingerprint(new DeliveryFingerprint(saleId, input));
        Delivery repeated = sales.findDeliveryByRequestKey(input.requestKey()).orElse(null);
        if (repeated != null) return sameDelivery(repeated, saleId, hash);
        try {
            return transactions.execute(status -> {
                Sale before = sales.findByIdForUpdate(saleId)
                    .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "SALE_NOT_FOUND",
                        "Venta no encontrada."));
                Delivery duplicate = sales.findDeliveryByRequestKey(input.requestKey()).orElse(null);
                if (duplicate != null) return sameDelivery(duplicate, saleId, hash);
                if (!before.status().equals("PENDING")) {
                    throw problem(HttpStatus.CONFLICT, "SALE_NOT_PENDING",
                        "Esta venta ya no tiene entregas pendientes.");
                }
                List<SaleLine> oldLines = sales.lines(saleId);
                Map<UUID, SaleLine> byId = oldLines.stream().collect(
                    Collectors.toMap(SaleLine::id, line -> line));
                Map<HairType, BigDecimal> requested = new TreeMap<>();
                for (DeliveryItemInput item : input.items()) {
                    SaleLine line = byId.get(item.lineId());
                    if (line == null) {
                        throw problem(HttpStatus.BAD_REQUEST, "INVALID_LINE",
                            "Una línea no pertenece a esta venta.");
                    }
                    BigDecimal remaining = line.agreedWeight().subtract(line.deliveredWeight());
                    if (item.weight().compareTo(remaining) > 0) {
                        throw problem(HttpStatus.CONFLICT, "EXCESS_DELIVERY",
                            "La entrega de " + line.categoryName() + " " + line.lengthCm()
                                + " cm supera los " + remaining + " g pendientes.");
                    }
                    requested.merge(new HairType(line.categoryCode(), line.lengthCm()),
                        item.weight(), BigDecimal::add);
                }
                inventory.lockTypes(requested.keySet());
                List<AvailabilityIssue> shortages = new ArrayList<>();
                for (var entry : requested.entrySet()) {
                    StockPosition position = inventory.position(entry.getKey());
                    BigDecimal missing = entry.getValue().subtract(position.physical())
                        .max(BigDecimal.ZERO);
                    if (missing.signum() > 0) {
                        HairType type = entry.getKey();
                        shortages.add(new AvailabilityIssue(type.categoryCode(), type.lengthCm(),
                            entry.getValue(), position.physical(), position.pending(), missing));
                    }
                }
                if (!shortages.isEmpty()) {
                    throw new SaleProblem(HttpStatus.CONFLICT, "INSUFFICIENT_PHYSICAL_STOCK",
                        "No se registró ninguna entrega: falta stock físico en uno o más tipos.",
                        shortages);
                }

                String oldValues = snapshotJson(before, oldLines);
                UUID deliveryId = UUID.randomUUID();
                sales.addDelivery(deliveryId, saleId, input.requestKey(), hash,
                    input.effectiveAt().toInstant());
                for (DeliveryItemInput item : input.items()) {
                    sales.addDeliveryLine(UUID.randomUUID(), deliveryId, saleId,
                        item.lineId(), item.weight());
                }
                try {
                    allocation.rebuild(requested.keySet());
                } catch (StockAllocationService.AllocationProblem conflict) {
                    throw problem(HttpStatus.CONFLICT, "HISTORICAL_STOCK_SHORTAGE",
                        conflict.getMessage());
                }
                List<SaleLine> afterLines = sales.lines(saleId);
                boolean completed = afterLines.stream().allMatch(line ->
                    line.deliveredWeight().compareTo(line.agreedWeight()) == 0);
                if (completed) sales.confirm(saleId);
                else sales.touch(saleId);
                Sale after = get(saleId);
                Map<String, Object> movement = new HashMap<>();
                movement.put("sale", json.readTree(snapshotJson(after, afterLines)));
                movement.put("deliveryId", deliveryId.toString());
                movement.put("effectiveAt", input.effectiveAt().toInstant().toString());
                movement.put("recordedAt", sales.deliveries(saleId).stream()
                    .filter(delivery -> delivery.id().equals(deliveryId)).findFirst()
                    .orElseThrow().recordedAt().toString());
                movement.put("items", input.items());
                sales.addHistory(saleId, "DELIVERY_RECORDED", actorId, null,
                    oldValues, json.writeValueAsString(movement));
                return after;
            });
        } catch (DataIntegrityViolationException conflict) {
            Delivery duplicate = sales.findDeliveryByRequestKey(input.requestKey()).orElse(null);
            if (duplicate != null) return sameDelivery(duplicate, saleId, hash);
            throw problem(HttpStatus.CONFLICT, "DELIVERY_CONFLICT",
                "La venta o el inventario cambió durante el registro de la entrega.");
        }
    }

    Sale correctDelivery(UUID saleId, UUID deliveryId, CorrectionInput raw, UUID actorId) {
        CorrectionInput input = validateCorrection(raw);
        return transactions.execute(status -> {
            Sale before = lockedAtVersion(saleId, input.expectedVersion());
            Delivery delivery = activeDelivery(saleId, deliveryId);
            List<SaleLine> oldLines = sales.lines(saleId);
            Set<HairType> affectedTypes = typesOf(oldLines);
            inventory.lockTypes(affectedTypes);
            List<DeliveryItem> oldItems = sales.deliveryItems(deliveryId);
            Map<UUID, DeliveryItem> itemByLine = oldItems.stream().collect(
                Collectors.toMap(DeliveryItem::saleLineId, item -> item));
            Set<UUID> supplied = input.items().stream()
                .map(DeliveryItemInput::lineId).collect(Collectors.toSet());
            if (!supplied.equals(itemByLine.keySet())) {
                throw problem(HttpStatus.BAD_REQUEST, "INVALID_DELIVERY_LINES",
                    "La corrección debe incluir exactamente las líneas originales de la entrega.");
            }
            Map<UUID, SaleLine> saleLineById = oldLines.stream().collect(
                Collectors.toMap(SaleLine::id, line -> line));
            boolean changed = !delivery.effectiveAt().equals(input.effectiveAt().toInstant());
            for (DeliveryItemInput item : input.items()) {
                DeliveryItem original = itemByLine.get(item.lineId());
                SaleLine line = saleLineById.get(item.lineId());
                if (line == null) {
                    throw problem(HttpStatus.CONFLICT, "INVALID_DELIVERY_LINES",
                        "Una línea de la entrega ya no pertenece a la venta.");
                }
                BigDecimal afterDelivered = line.deliveredWeight()
                    .subtract(original.weight()).add(item.weight());
                if (afterDelivered.compareTo(line.agreedWeight()) > 0) {
                    throw problem(HttpStatus.CONFLICT, "EXCESS_DELIVERY",
                        "La corrección de " + line.categoryName() + " " + line.lengthCm()
                            + " cm supera los " + line.agreedWeight() + " g acordados.");
                }
                if (item.weight().compareTo(original.weight()) != 0) changed = true;
            }
            if (!changed) {
                throw problem(HttpStatus.BAD_REQUEST, "NO_CHANGES",
                    "No hay cambios en la entrega.");
            }
            String oldValues = snapshotMovementJson(before, oldLines, delivery, oldItems);
            if (!delivery.effectiveAt().equals(input.effectiveAt().toInstant())) {
                sales.updateDeliveryTime(deliveryId, input.effectiveAt().toInstant());
            }
            for (DeliveryItemInput item : input.items()) {
                DeliveryItem original = itemByLine.get(item.lineId());
                if (item.weight().compareTo(original.weight()) != 0) {
                    sales.updateDeliveryItem(original.id(), item.weight());
                }
            }
            rebuildAllocations(affectedTypes);
            List<SaleLine> afterLines = sales.lines(saleId);
            sales.reconcileStatusAfterDeliveryChange(saleId, isCompleted(afterLines));
            ensureReservationsBacked(affectedTypes);
            Sale after = get(saleId);
            SalePaymentService.requireWithinPayable(payments.totalActive(saleId),
                SalePaymentService.payableTotal(after, afterLines));
            sales.addHistory(saleId, "DELIVERY_CORRECTED", actorId, input.reason(),
                oldValues, snapshotMovementJson(after, afterLines,
                    sales.findDeliveryById(deliveryId).orElseThrow(),
                    sales.deliveryItems(deliveryId)));
            return after;
        });
    }

    Sale voidDelivery(UUID saleId, UUID deliveryId, VoidDeliveryInput raw, UUID actorId) {
        if (raw == null || raw.expectedVersion() == null || raw.expectedVersion() < 0) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_VERSION",
                "Indica la versión actual de la venta.");
        }
        String reason = validateReason(raw.reason());
        return transactions.execute(status -> {
            Sale before = lockedAtVersion(saleId, raw.expectedVersion());
            Delivery delivery = activeDelivery(saleId, deliveryId);
            List<SaleLine> oldLines = sales.lines(saleId);
            Set<HairType> affectedTypes = typesOf(oldLines);
            inventory.lockTypes(affectedTypes);
            List<DeliveryItem> oldItems = sales.deliveryItems(deliveryId);
            String oldValues = snapshotMovementJson(before, oldLines, delivery, oldItems);
            sales.voidDelivery(deliveryId);
            rebuildAllocations(affectedTypes);
            List<SaleLine> afterLines = sales.lines(saleId);
            sales.reconcileStatusAfterDeliveryChange(saleId, isCompleted(afterLines));
            ensureReservationsBacked(affectedTypes);
            Sale after = get(saleId);
            SalePaymentService.requireWithinPayable(payments.totalActive(saleId),
                SalePaymentService.payableTotal(after, afterLines));
            sales.addHistory(saleId, "DELIVERY_VOIDED", actorId, reason,
                oldValues, snapshotMovementJson(after, afterLines,
                    sales.findDeliveryById(deliveryId).orElseThrow(), oldItems));
            return after;
        });
    }

    private Sale lockedAtVersion(UUID saleId, long expectedVersion) {
        Sale sale = sales.findByIdForUpdate(saleId)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "SALE_NOT_FOUND",
                "Venta no encontrada."));
        if (sale.version() != expectedVersion) {
            throw problem(HttpStatus.CONFLICT, "SALE_VERSION_CONFLICT",
                "La venta cambió desde que la abriste. Recarga el detalle antes de continuar.");
        }
        return sale;
    }

    private Delivery activeDelivery(UUID saleId, UUID deliveryId) {
        Delivery delivery = sales.findDeliveryById(deliveryId)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "DELIVERY_NOT_FOUND",
                "Entrega no encontrada."));
        if (!delivery.saleId().equals(saleId)) {
            throw problem(HttpStatus.NOT_FOUND, "DELIVERY_NOT_FOUND",
                "Entrega no encontrada en esta venta.");
        }
        if (delivery.voidedAt() != null) {
            throw problem(HttpStatus.CONFLICT, "DELIVERY_VOIDED",
                "La entrega ya fue anulada.");
        }
        return delivery;
    }

    private static boolean isCompleted(List<SaleLine> lines) {
        return lines.stream().allMatch(line ->
            line.deliveredWeight().compareTo(line.agreedWeight()) == 0);
    }

    private static Set<HairType> typesOf(List<SaleLine> lines) {
        return lines.stream().map(line -> new HairType(line.categoryCode(), line.lengthCm()))
            .collect(Collectors.toSet());
    }

    private void rebuildAllocations(Set<HairType> types) {
        try {
            allocation.rebuild(types);
        } catch (StockAllocationService.AllocationProblem conflict) {
            throw problem(HttpStatus.CONFLICT, "HISTORICAL_STOCK_SHORTAGE",
                "No se puede modificar la entrega porque dejaría un movimiento sin stock en su fecha real: "
                    + conflict.getMessage());
        }
    }

    private void ensureReservationsBacked(Set<HairType> types) {
        var shortages = inventory.backingShortages(types);
        if (shortages.isEmpty()) return;
        String details = shortages.stream().map(shortage ->
            shortage.type().categoryCode() + " " + shortage.type().lengthCm()
                + " cm: faltan " + shortage.missing() + " g"
        ).collect(Collectors.joining("; "));
        throw problem(HttpStatus.CONFLICT, "UNBACKED_RESERVATIONS",
            "El cambio dejaría reservas sin respaldo: " + details + ".");
    }

    private Sale sameDelivery(Delivery delivery, UUID saleId, String hash) {
        if (!delivery.saleId().equals(saleId) || !delivery.requestHash().equals(hash)) {
            throw problem(HttpStatus.CONFLICT, "REQUEST_KEY_REUSED",
                "La clave de solicitud ya se usó con otros datos.");
        }
        return get(saleId);
    }

    private DeliveryInput validateDelivery(DeliveryInput raw) {
        if (raw == null || raw.requestKey() == null || raw.effectiveAt() == null
            || raw.items() == null || raw.items().isEmpty() || raw.items().size() > 100) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_DELIVERY",
                "Indica clave de solicitud, fecha y entre 1 y 100 líneas de entrega.");
        }
        if (raw.effectiveAt().toInstant().isAfter(Instant.now().plusSeconds(300))) {
            throw problem(HttpStatus.BAD_REQUEST, "FUTURE_DELIVERY",
                "La hora real de entrega no puede estar en el futuro.");
        }
        return new DeliveryInput(raw.requestKey(), raw.effectiveAt(),
            validateDeliveryItems(raw.items()));
    }

    private CorrectionInput validateCorrection(CorrectionInput raw) {
        if (raw == null || raw.expectedVersion() == null || raw.expectedVersion() < 0
            || raw.effectiveAt() == null || raw.items() == null || raw.items().isEmpty()
            || raw.items().size() > 100) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_DELIVERY",
                "Indica versión, fecha y entre 1 y 100 líneas de la entrega.");
        }
        if (raw.effectiveAt().toInstant().isAfter(Instant.now().plusSeconds(300))) {
            throw problem(HttpStatus.BAD_REQUEST, "FUTURE_DELIVERY",
                "La hora real de entrega no puede estar en el futuro.");
        }
        return new CorrectionInput(raw.expectedVersion(), raw.effectiveAt(),
            validateDeliveryItems(raw.items()), validateReason(raw.reason()));
    }

    private List<DeliveryItemInput> validateDeliveryItems(List<DeliveryItemInput> rawItems) {
        Set<UUID> seen = new HashSet<>();
        return rawItems.stream().map(item -> {
            if (item == null || item.lineId() == null || !seen.add(item.lineId())) {
                throw problem(HttpStatus.BAD_REQUEST, "INVALID_LINE",
                    "Cada línea de entrega debe aparecer una sola vez.");
            }
            return new DeliveryItemInput(item.lineId(),
                positiveTwoDecimals(item.weight(), "peso entregado"));
        }).toList();
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
                "deliveredWeight", line.deliveredWeight(),
                "pricePerGram", line.pricePerGram()
            )).toList()
        ));
    }

    private String snapshotMovementJson(Sale sale, List<SaleLine> lines,
                                        Delivery delivery, List<DeliveryItem> items) {
        Map<String, Object> movement = new HashMap<>();
        movement.put("id", delivery.id().toString());
        movement.put("effectiveAt", delivery.effectiveAt().toString());
        movement.put("recordedAt", delivery.recordedAt().toString());
        movement.put("voidedAt", delivery.voidedAt() == null
            ? null : delivery.voidedAt().toString());
        movement.put("items", items.stream().map(item -> Map.of(
            "deliveryItemId", item.id().toString(),
            "saleLineId", item.saleLineId().toString(),
            "weight", item.weight(),
            "consumedLots", sales.consumptions(item.id())
        )).toList());
        return json.writeValueAsString(Map.of(
            "sale", json.readTree(snapshotJson(sale, lines)),
            "delivery", movement
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
    record ImmediateInput(UUID requestKey, String customerName, LocalDate operationDate,
                          List<LineInput> lines, OffsetDateTime effectiveAt) {}
    record EditLineInput(UUID id, String categoryCode, Integer lengthCm,
                         BigDecimal weight, BigDecimal pricePerGram) {}
    record EditInput(Long expectedVersion, String customerName, LocalDate operationDate,
                     List<EditLineInput> lines, boolean acceptPendingStock, String reason) {}
    record DeliveryItemInput(UUID lineId, BigDecimal weight) {}
    record DeliveryInput(UUID requestKey, OffsetDateTime effectiveAt,
                         List<DeliveryItemInput> items) {}
    record CorrectionInput(Long expectedVersion, OffsetDateTime effectiveAt,
                           List<DeliveryItemInput> items, String reason) {}
    record VoidDeliveryInput(Long expectedVersion, String reason) {}
    private record DeliveryFingerprint(UUID saleId, DeliveryInput input) {}
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
