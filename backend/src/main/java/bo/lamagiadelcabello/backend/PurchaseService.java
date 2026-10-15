package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;

import bo.lamagiadelcabello.backend.PurchaseRepository.Purchase;
import bo.lamagiadelcabello.backend.PurchaseRepository.PurchaseLine;
import bo.lamagiadelcabello.backend.PurchaseRepository.Receipt;
import bo.lamagiadelcabello.backend.PurchaseRepository.ReceiptItem;
import bo.lamagiadelcabello.backend.PurchaseRepository.StockLot;
import bo.lamagiadelcabello.backend.SaleInventoryRepository.HairType;

@Service
class PurchaseService {

    private final PurchaseRepository purchases;
    private final SupplierRepository suppliers;
    private final CatalogRepository catalog;
    private final PurchasePaymentRepository payments;
    private final SaleInventoryRepository inventory;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    PurchaseService(PurchaseRepository purchases, SupplierRepository suppliers,
                    CatalogRepository catalog, PurchasePaymentRepository payments,
                    SaleInventoryRepository inventory, TransactionTemplate transactions,
                    ObjectMapper json) {
        this.purchases = purchases;
        this.suppliers = suppliers;
        this.catalog = catalog;
        this.payments = payments;
        this.inventory = inventory;
        this.transactions = transactions;
        this.json = json;
    }

    List<Purchase> list() { return purchases.list(); }

    Purchase get(UUID id) {
        return purchases.findById(id)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Compra no encontrada."));
    }

    Purchase create(CreateInput raw, UUID actorId) {
        CreateInput input = validateCreate(raw);
        String fingerprint = fingerprint(input);
        Purchase existing = purchases.findByRequestKey(input.requestKey()).orElse(null);
        if (existing != null) return sameRequest(existing, fingerprint);

        try {
            return transactions.execute(status -> {
                Purchase duplicate = purchases.findByRequestKey(input.requestKey()).orElse(null);
                if (duplicate != null) return sameRequest(duplicate, fingerprint);
                if (suppliers.findById(input.supplierId()).isEmpty()) {
                    throw problem(HttpStatus.BAD_REQUEST, "El proveedor seleccionado no existe.");
                }
                Set<String> categories = catalog.categories().stream()
                    .map(CatalogRepository.Category::code).collect(java.util.stream.Collectors.toSet());
                Set<Integer> lengths = catalog.lengths().stream()
                    .map(CatalogRepository.Length::centimeters).collect(java.util.stream.Collectors.toSet());
                for (LineInput line : input.lines()) {
                    if (!categories.contains(line.categoryCode()) || !lengths.contains(line.lengthCm())) {
                        throw problem(HttpStatus.BAD_REQUEST,
                            "Alguna categoría o longitud seleccionada ya no existe.");
                    }
                }
                Set<HairType> types = new HashSet<>();
                for (LineInput line : input.lines()) {
                    types.add(new HairType(line.categoryCode(), line.lengthCm()));
                }
                inventory.lockTypes(types);

                UUID purchaseId = UUID.randomUUID();
                purchases.create(purchaseId, input.requestKey(), fingerprint,
                    input.supplierId(), input.operationDate());
                for (LineInput line : input.lines()) {
                    purchases.addLine(UUID.randomUUID(), purchaseId, line.categoryCode(),
                        line.lengthCm(), line.weight(), line.pricePerGram());
                }
                purchases.addHistory(purchaseId, "PURCHASE_CREATED", actorId, null,
                    null, snapshotJson(purchaseId));

                if (input.receiveNow()) {
                    List<ReceiptItemInput> all = purchases.lines(purchaseId).stream()
                        .map(line -> new ReceiptItemInput(line.id(), line.agreedWeight())).toList();
                    UUID receiptKey = UUID.nameUUIDFromBytes(
                        (input.requestKey() + ":initial-receipt").getBytes(StandardCharsets.UTF_8));
                    recordReceipt(purchaseId, new ReceiptInput(receiptKey, input.effectiveAt(), all), actorId);
                }
                return get(purchaseId);
            });
        } catch (DataIntegrityViolationException conflict) {
            Purchase repeated = purchases.findByRequestKey(input.requestKey()).orElse(null);
            if (repeated != null) return sameRequest(repeated, fingerprint);
            throw problem(HttpStatus.CONFLICT,
                "El proveedor, categoría o longitud cambió durante el registro; vuelve a consultar los datos.");
        }
    }

    Purchase receive(UUID purchaseId, ReceiptInput raw, UUID actorId) {
        ReceiptInput input = validateReceipt(raw);
        String fingerprint = fingerprint(new ReceiptFingerprint(purchaseId, input));
        PurchaseRepository.Receipt existing = purchases.findReceiptByRequestKey(input.requestKey()).orElse(null);
        if (existing != null) return sameReceipt(existing, purchaseId, fingerprint);

        try {
            return transactions.execute(status -> recordReceipt(purchaseId, input, actorId));
        } catch (DataIntegrityViolationException conflict) {
            PurchaseRepository.Receipt repeated = purchases.findReceiptByRequestKey(input.requestKey()).orElse(null);
            if (repeated != null) return sameReceipt(repeated, purchaseId, fingerprint);
            throw problem(HttpStatus.CONFLICT, "La recepción no pudo registrarse por un cambio simultáneo.");
        }
    }

    Purchase edit(UUID purchaseId, EditInput raw, UUID actorId) {
        EditInput input = validateEdit(raw);
        try {
            return transactions.execute(status -> {
                Purchase before = purchases.findByIdForUpdate(purchaseId)
                    .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Compra no encontrada."));
                if (before.version() != input.expectedVersion()) {
                    throw problem(HttpStatus.CONFLICT,
                        "La compra cambió desde que la abriste. Recarga el detalle antes de editar.");
                }
                if (before.status().equals("CANCELED")) {
                    throw problem(HttpStatus.CONFLICT, "No se puede editar una compra anulada.");
                }
                if (suppliers.findById(input.supplierId()).isEmpty()) {
                    throw problem(HttpStatus.BAD_REQUEST, "El proveedor seleccionado no existe.");
                }
                Set<String> categories = catalog.categories().stream()
                    .map(CatalogRepository.Category::code).collect(java.util.stream.Collectors.toSet());
                Set<Integer> lengths = catalog.lengths().stream()
                    .map(CatalogRepository.Length::centimeters).collect(java.util.stream.Collectors.toSet());
                for (EditLineInput line : input.lines()) {
                    if (!categories.contains(line.categoryCode()) || !lengths.contains(line.lengthCm())) {
                        throw problem(HttpStatus.BAD_REQUEST,
                            "Alguna categoría o longitud seleccionada ya no existe.");
                    }
                }

                List<PurchaseLine> oldLines = purchases.lines(purchaseId);
                Set<HairType> affectedTypes = typesOf(oldLines);
                for (EditLineInput line : input.lines()) {
                    affectedTypes.add(new HairType(line.categoryCode(), line.lengthCm()));
                }
                inventory.lockTypes(affectedTypes);
                Map<UUID, PurchaseLine> oldById = new HashMap<>();
                for (PurchaseLine line : oldLines) oldById.put(line.id(), line);
                Set<UUID> suppliedIds = new HashSet<>();
                for (EditLineInput line : input.lines()) {
                    if (line.id() != null && !suppliedIds.add(line.id())) {
                        throw problem(HttpStatus.BAD_REQUEST, "Una línea aparece más de una vez.");
                    }
                    if (line.id() != null && !oldById.containsKey(line.id())) {
                        throw problem(HttpStatus.BAD_REQUEST, "Una línea no pertenece a esta compra.");
                    }
                }

                boolean changed = !before.supplierId().equals(input.supplierId())
                    || !before.operationDate().equals(input.operationDate());
                String oldValues = snapshotJson(before, oldLines);
                for (PurchaseLine old : oldLines) {
                    if (suppliedIds.contains(old.id())) continue;
                    if (old.receivedWeight().signum() > 0 || before.status().equals("CONFIRMED")) {
                        throw problem(HttpStatus.CONFLICT,
                            "No puedes quitar una línea que ya recibió cabello.");
                    }
                    purchases.deleteLine(old.id());
                    changed = true;
                }

                for (EditLineInput line : input.lines()) {
                    if (line.id() == null) {
                        if (before.status().equals("CONFIRMED")) {
                            throw problem(HttpStatus.CONFLICT,
                                "No puedes agregar líneas a una compra confirmada.");
                        }
                        purchases.addLine(UUID.randomUUID(), purchaseId, line.categoryCode(),
                            line.lengthCm(), line.weight(), line.pricePerGram());
                        changed = true;
                        continue;
                    }
                    PurchaseLine old = oldById.get(line.id());
                    if (line.weight().compareTo(old.receivedWeight()) < 0) {
                        throw problem(HttpStatus.CONFLICT,
                            "No puedes reducir " + old.categoryName() + " " + old.lengthCm()
                                + " cm por debajo de " + old.receivedWeight() + " g ya recibidos.");
                    }
                    boolean typeChanged = !old.categoryCode().equals(line.categoryCode())
                        || old.lengthCm() != line.lengthCm();
                    if (typeChanged && old.receivedWeight().signum() > 0) {
                        throw problem(HttpStatus.CONFLICT,
                            "No puedes cambiar el tipo de cabello de una línea ya recibida.");
                    }
                    if (before.status().equals("CONFIRMED")
                        && line.weight().compareTo(old.agreedWeight()) != 0) {
                        throw problem(HttpStatus.CONFLICT,
                            "No puedes cambiar la cantidad completada de una compra confirmada.");
                    }
                    boolean priceChanged = line.pricePerGram().compareTo(old.pricePerGram()) != 0;
                    boolean lineChanged = typeChanged || priceChanged
                        || line.weight().compareTo(old.agreedWeight()) != 0;
                    if (!lineChanged) continue;
                    purchases.updateLine(line.id(), line.categoryCode(), line.lengthCm(),
                        line.weight(), line.pricePerGram());
                    if (priceChanged) purchases.updateLotCost(line.id(), line.pricePerGram());
                    changed = true;
                }
                if (!changed) {
                    throw problem(HttpStatus.BAD_REQUEST, "No hay cambios en la compra.");
                }
                purchases.updateHeader(purchaseId, input.supplierId(), input.operationDate());
                List<PurchaseLine> afterLines = purchases.lines(purchaseId);
                ensureReservationsBacked(affectedTypes);
                PurchasePaymentService.requireWithinPayable(payments.totalActive(purchaseId),
                    PurchasePaymentService.payableTotal(before, afterLines));
                boolean completed = afterLines.stream()
                    .allMatch(line -> line.receivedWeight().compareTo(line.agreedWeight()) == 0);
                if (before.status().equals("PENDING") && completed) purchases.confirm(purchaseId);
                else purchases.touch(purchaseId);
                Purchase after = get(purchaseId);
                purchases.addHistory(purchaseId, "PURCHASE_UPDATED", actorId, input.reason(),
                    oldValues, snapshotJson(after, afterLines));
                return after;
            });
        } catch (DataIntegrityViolationException conflict) {
            throw problem(HttpStatus.CONFLICT,
                "El proveedor, categoría o longitud cambió durante la edición; vuelve a consultar los datos.");
        }
    }

    Purchase correctReceipt(UUID purchaseId, UUID receiptId, CorrectionInput raw, UUID actorId) {
        CorrectionInput input = validateCorrection(raw);
        return transactions.execute(status -> {
            Purchase before = lockedPurchaseAtVersion(purchaseId, input.expectedVersion());
            Receipt receipt = activeReceipt(purchaseId, receiptId);
            List<PurchaseLine> oldLines = purchases.lines(purchaseId);
            Set<HairType> affectedTypes = typesOf(oldLines);
            inventory.lockTypes(affectedTypes);
            List<ReceiptItem> oldItems = purchases.receiptItems(receiptId);
            List<StockLot> lots = purchases.stockLotsForReceiptForUpdate(receiptId);
            Map<UUID, ReceiptItem> itemByLine = new HashMap<>();
            Map<UUID, StockLot> lotByLine = new HashMap<>();
            for (ReceiptItem item : oldItems) itemByLine.put(item.purchaseLineId(), item);
            for (StockLot lot : lots) lotByLine.put(lot.purchaseLineId(), lot);
            Set<UUID> requested = new HashSet<>();
            for (ReceiptItemInput item : input.items()) requested.add(item.lineId());
            if (!requested.equals(itemByLine.keySet()) || lots.size() != oldItems.size()) {
                throw problem(HttpStatus.BAD_REQUEST,
                    "La corrección debe incluir exactamente las líneas originales de la recepción.");
            }

            Map<UUID, PurchaseLine> purchaseLineById = new HashMap<>();
            for (PurchaseLine line : oldLines) purchaseLineById.put(line.id(), line);
            boolean changed = !receipt.effectiveAt().equals(input.effectiveAt().toInstant());
            boolean hasSoldHair = false;
            for (ReceiptItemInput item : input.items()) {
                ReceiptItem original = itemByLine.get(item.lineId());
                StockLot lot = lotByLine.get(item.lineId());
                if (lot == null || lot.voidedAt() != null) {
                    throw problem(HttpStatus.CONFLICT, "El lote de esta recepción ya no está disponible.");
                }
                BigDecimal consumed = lot.originalWeight().subtract(lot.remainingWeight());
                if (consumed.signum() > 0) hasSoldHair = true;
                if (item.weight().compareTo(consumed) < 0) {
                    throw problem(HttpStatus.CONFLICT,
                        "No puedes reducir esta recepción por debajo de " + consumed
                            + " g ya vendidos de ese lote.");
                }
                PurchaseLine line = purchaseLineById.get(item.lineId());
                BigDecimal afterReceived = line.receivedWeight()
                    .subtract(original.weight()).add(item.weight());
                if (afterReceived.compareTo(line.agreedWeight()) > 0) {
                    throw problem(HttpStatus.CONFLICT,
                        "La corrección de " + line.categoryName() + " " + line.lengthCm()
                            + " cm supera los " + line.agreedWeight() + " g acordados.");
                }
                if (item.weight().compareTo(original.weight()) != 0) changed = true;
            }
            if (!changed) throw problem(HttpStatus.BAD_REQUEST, "No hay cambios en la recepción.");
            if (hasSoldHair) {
                throw problem(HttpStatus.CONFLICT,
                    "Esta recepción ya tiene cabello vendido; la corrección requiere recalcular consumos y márgenes.");
            }

            String oldValues = snapshotMovementJson(before, oldLines, receipt, oldItems);
            if (!receipt.effectiveAt().equals(input.effectiveAt().toInstant())) {
                purchases.updateReceiptTime(receiptId, input.effectiveAt().toInstant());
            }
            for (ReceiptItemInput item : input.items()) {
                ReceiptItem original = itemByLine.get(item.lineId());
                if (item.weight().compareTo(original.weight()) == 0) continue;
                StockLot lot = lotByLine.get(item.lineId());
                BigDecimal consumed = lot.originalWeight().subtract(lot.remainingWeight());
                purchases.updateReceiptItem(original.id(), item.weight());
                purchases.updateStockLotWeight(lot.id(), item.weight(), item.weight().subtract(consumed));
            }
            List<PurchaseLine> afterLines = purchases.lines(purchaseId);
            purchases.reconcileStatusAfterReceiptChange(purchaseId, isCompleted(afterLines));
            ensureReservationsBacked(affectedTypes);
            Purchase after = get(purchaseId);
            PurchasePaymentService.requireWithinPayable(payments.totalActive(purchaseId),
                PurchasePaymentService.payableTotal(after, afterLines));
            purchases.addHistory(purchaseId, "RECEIPT_CORRECTED", actorId, input.reason(),
                oldValues, snapshotMovementJson(after, afterLines,
                    purchases.findReceiptById(receiptId).orElseThrow(), purchases.receiptItems(receiptId)));
            return after;
        });
    }

    Purchase voidReceipt(UUID purchaseId, UUID receiptId, VoidReceiptInput raw, UUID actorId) {
        if (raw == null || raw.expectedVersion() == null || raw.expectedVersion() < 0) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica la versión actual de la compra.");
        }
        String reason = validateReason(raw.reason());
        return transactions.execute(status -> {
            Purchase before = lockedPurchaseAtVersion(purchaseId, raw.expectedVersion());
            Receipt receipt = activeReceipt(purchaseId, receiptId);
            List<PurchaseLine> oldLines = purchases.lines(purchaseId);
            Set<HairType> affectedTypes = typesOf(oldLines);
            inventory.lockTypes(affectedTypes);
            List<ReceiptItem> oldItems = purchases.receiptItems(receiptId);
            List<StockLot> lots = purchases.stockLotsForReceiptForUpdate(receiptId);
            if (lots.size() != oldItems.size()) {
                throw problem(HttpStatus.CONFLICT,
                    "Los lotes de esta recepción están incompletos; no se puede anular.");
            }
            for (StockLot lot : lots) {
                if (lot.voidedAt() != null) {
                    throw problem(HttpStatus.CONFLICT, "Un lote de esta recepción ya fue anulado.");
                }
                if (lot.originalWeight().compareTo(lot.remainingWeight()) != 0) {
                    throw problem(HttpStatus.CONFLICT,
                        "No puedes anular una recepción cuyo cabello ya se vendió.");
                }
            }
            String oldValues = snapshotMovementJson(before, oldLines, receipt, oldItems);
            purchases.voidReceipt(receiptId);
            List<PurchaseLine> afterLines = purchases.lines(purchaseId);
            purchases.reconcileStatusAfterReceiptChange(purchaseId, isCompleted(afterLines));
            ensureReservationsBacked(affectedTypes);
            Purchase after = get(purchaseId);
            PurchasePaymentService.requireWithinPayable(payments.totalActive(purchaseId),
                PurchasePaymentService.payableTotal(after, afterLines));
            purchases.addHistory(purchaseId, "RECEIPT_VOIDED", actorId, reason,
                oldValues, snapshotMovementJson(after, afterLines,
                    purchases.findReceiptById(receiptId).orElseThrow(), oldItems));
            return after;
        });
    }

    Purchase cancel(UUID purchaseId, String rawReason, UUID actorId) {
        String reason = validateReason(rawReason);
        return transactions.execute(status -> {
            Purchase before = purchases.findByIdForUpdate(purchaseId)
                .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Compra no encontrada."));
            if (!before.status().equals("PENDING")) {
                throw problem(HttpStatus.CONFLICT, "Solo se puede anular el saldo de una compra pendiente.");
            }
            List<PurchaseLine> lines = purchases.lines(purchaseId);
            Set<HairType> affectedTypes = typesOf(lines);
            inventory.lockTypes(affectedTypes);
            String oldValues = snapshotJson(before, lines);
            purchases.cancel(purchaseId);
            ensureReservationsBacked(affectedTypes);
            Purchase after = get(purchaseId);
            PurchasePaymentService.requireWithinPayable(payments.totalActive(purchaseId),
                PurchasePaymentService.payableTotal(after, lines));
            purchases.addHistory(purchaseId, "PURCHASE_CANCELED", actorId, reason,
                oldValues, snapshotJson(after, lines));
            return after;
        });
    }

    private Purchase recordReceipt(UUID purchaseId, ReceiptInput input, UUID actorId) {
        String fingerprint = fingerprint(new ReceiptFingerprint(purchaseId, input));
        Purchase before = purchases.findByIdForUpdate(purchaseId)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Compra no encontrada."));
        PurchaseRepository.Receipt duplicate = purchases.findReceiptByRequestKey(input.requestKey()).orElse(null);
        if (duplicate != null) return sameReceipt(duplicate, purchaseId, fingerprint);
        if (!before.status().equals("PENDING")) {
            throw problem(HttpStatus.CONFLICT, "Esta compra ya no tiene recepciones pendientes.");
        }

        List<PurchaseLine> lines = purchases.lines(purchaseId);
        inventory.lockTypes(typesOf(lines));
        Map<UUID, PurchaseLine> byId = lines.stream().collect(
            java.util.stream.Collectors.toMap(PurchaseLine::id, line -> line));
        for (ReceiptItemInput item : input.items()) {
            PurchaseLine line = byId.get(item.lineId());
            if (line == null) {
                throw problem(HttpStatus.BAD_REQUEST, "Una línea no pertenece a esta compra.");
            }
            BigDecimal remaining = line.agreedWeight().subtract(line.receivedWeight());
            if (item.weight().compareTo(remaining) > 0) {
                throw problem(HttpStatus.CONFLICT,
                    "La recepción de " + line.categoryName() + " " + line.lengthCm()
                        + " cm supera el pendiente: quedan " + remaining + " g.");
            }
        }

        String oldValues = snapshotJson(before, lines);
        UUID receiptId = UUID.randomUUID();
        Instant effectiveAt = input.effectiveAt().toInstant();
        purchases.addReceipt(receiptId, purchaseId, input.requestKey(), fingerprint, effectiveAt);
        for (ReceiptItemInput item : input.items()) {
            PurchaseLine line = byId.get(item.lineId());
            UUID receiptLineId = UUID.randomUUID();
            purchases.addReceiptLine(receiptLineId, receiptId, purchaseId, line.id(), item.weight());
            purchases.addStockLot(UUID.randomUUID(), receiptLineId, line.categoryCode(),
                line.lengthCm(), line.pricePerGram(), item.weight(), effectiveAt);
        }
        List<PurchaseLine> afterLines = purchases.lines(purchaseId);
        boolean completed = afterLines.stream()
            .allMatch(line -> line.receivedWeight().compareTo(line.agreedWeight()) == 0);
        if (completed) purchases.confirm(purchaseId);
        else purchases.touch(purchaseId);
        Purchase after = get(purchaseId);
        purchases.addHistory(purchaseId, "RECEIPT_RECORDED", actorId, null,
            oldValues, snapshotMovementJson(after, afterLines,
                purchases.findReceiptById(receiptId).orElseThrow(), purchases.receiptItems(receiptId)));
        return after;
    }

    private Purchase lockedPurchaseAtVersion(UUID purchaseId, long expectedVersion) {
        Purchase purchase = purchases.findByIdForUpdate(purchaseId)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Compra no encontrada."));
        if (purchase.version() != expectedVersion) {
            throw problem(HttpStatus.CONFLICT,
                "La compra cambió desde que la abriste. Recarga el detalle antes de continuar.");
        }
        return purchase;
    }

    private Receipt activeReceipt(UUID purchaseId, UUID receiptId) {
        Receipt receipt = purchases.findReceiptById(receiptId)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Recepción no encontrada."));
        if (!receipt.purchaseId().equals(purchaseId)) {
            throw problem(HttpStatus.NOT_FOUND, "Recepción no encontrada en esta compra.");
        }
        if (receipt.voidedAt() != null) {
            throw problem(HttpStatus.CONFLICT, "La recepción ya fue anulada.");
        }
        return receipt;
    }

    private static boolean isCompleted(List<PurchaseLine> lines) {
        return lines.stream().allMatch(line ->
            line.receivedWeight().compareTo(line.agreedWeight()) == 0);
    }

    private static Set<HairType> typesOf(List<PurchaseLine> lines) {
        Set<HairType> types = new HashSet<>();
        for (PurchaseLine line : lines) {
            types.add(new HairType(line.categoryCode(), line.lengthCm()));
        }
        return types;
    }

    private void ensureReservationsBacked(Set<HairType> types) {
        var shortages = inventory.backingShortages(types);
        if (shortages.isEmpty()) return;
        String details = shortages.stream().map(shortage ->
            shortage.type().categoryCode() + " " + shortage.type().lengthCm()
                + " cm: faltan " + shortage.missing() + " g"
        ).collect(java.util.stream.Collectors.joining("; "));
        throw problem(HttpStatus.CONFLICT,
            "El cambio dejaría reservas de ventas sin respaldo: " + details + ".");
    }

    private Purchase sameRequest(Purchase existing, String fingerprint) {
        if (!existing.requestHash().equals(fingerprint)) {
            throw problem(HttpStatus.CONFLICT, "La clave de solicitud ya se usó con otros datos.");
        }
        return existing;
    }

    private Purchase sameReceipt(PurchaseRepository.Receipt existing, UUID purchaseId, String fingerprint) {
        if (!existing.purchaseId().equals(purchaseId) || !existing.requestHash().equals(fingerprint)) {
            throw problem(HttpStatus.CONFLICT, "La clave de recepción ya se usó con otros datos.");
        }
        return get(purchaseId);
    }

    private CreateInput validateCreate(CreateInput raw) {
        if (raw == null || raw.requestKey() == null || raw.supplierId() == null
            || raw.operationDate() == null || raw.lines() == null
            || raw.lines().isEmpty() || raw.lines().size() > 100) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Indica clave de solicitud, proveedor, fecha y entre 1 y 100 líneas de compra.");
        }
        if (raw.receiveNow() != (raw.effectiveAt() != null)) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Indica fecha y hora real de recepción solo cuando recibes toda la compra ahora.");
        }
        if (raw.effectiveAt() != null) validateEffectiveAt(raw.effectiveAt());
        List<LineInput> lines = raw.lines().stream().map(this::validateLine).toList();
        return new CreateInput(raw.requestKey(), raw.supplierId(), raw.operationDate(),
            lines, raw.receiveNow(), raw.effectiveAt());
    }

    private LineInput validateLine(LineInput raw) {
        if (raw == null || raw.categoryCode() == null || raw.categoryCode().isBlank()
            || raw.lengthCm() == null || raw.lengthCm() <= 0) {
            throw problem(HttpStatus.BAD_REQUEST, "Cada línea necesita categoría y longitud válidas.");
        }
        BigDecimal weight = positiveTwoDecimals(raw.weight(), "peso");
        BigDecimal price = positiveTwoDecimals(raw.pricePerGram(), "precio por gramo");
        return new LineInput(raw.categoryCode(), raw.lengthCm(), weight, price);
    }

    private ReceiptInput validateReceipt(ReceiptInput raw) {
        if (raw == null || raw.requestKey() == null || raw.effectiveAt() == null
            || raw.items() == null || raw.items().isEmpty() || raw.items().size() > 100) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Indica clave de solicitud, fecha y hora real, y líneas recibidas.");
        }
        validateEffectiveAt(raw.effectiveAt());
        Set<UUID> seen = new HashSet<>();
        List<ReceiptItemInput> items = raw.items().stream().map(item -> {
            if (item == null || item.lineId() == null || !seen.add(item.lineId())) {
                throw problem(HttpStatus.BAD_REQUEST, "Cada línea recibida debe aparecer una sola vez.");
            }
            return new ReceiptItemInput(item.lineId(), positiveTwoDecimals(item.weight(), "peso recibido"));
        }).toList();
        return new ReceiptInput(raw.requestKey(), raw.effectiveAt(), items);
    }

    private EditInput validateEdit(EditInput raw) {
        if (raw == null || raw.expectedVersion() == null || raw.expectedVersion() < 0
            || raw.supplierId() == null || raw.operationDate() == null
            || raw.lines() == null || raw.lines().isEmpty() || raw.lines().size() > 100) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Indica versión, proveedor, fecha y entre 1 y 100 líneas de compra.");
        }
        String reason = validateReason(raw.reason());
        List<EditLineInput> lines = raw.lines().stream().map(line -> {
            if (line == null) throw problem(HttpStatus.BAD_REQUEST, "Hay una línea vacía.");
            LineInput validated = validateLine(new LineInput(line.categoryCode(),
                line.lengthCm(), line.weight(), line.pricePerGram()));
            return new EditLineInput(line.id(), validated.categoryCode(), validated.lengthCm(),
                validated.weight(), validated.pricePerGram());
        }).toList();
        return new EditInput(raw.expectedVersion(), raw.supplierId(), raw.operationDate(), lines, reason);
    }

    private CorrectionInput validateCorrection(CorrectionInput raw) {
        if (raw == null || raw.expectedVersion() == null || raw.expectedVersion() < 0
            || raw.effectiveAt() == null || raw.items() == null || raw.items().isEmpty()
            || raw.items().size() > 100) {
            throw problem(HttpStatus.BAD_REQUEST,
                "Indica la versión actual, fecha y hora real, y todas las líneas de la recepción.");
        }
        validateEffectiveAt(raw.effectiveAt());
        String reason = validateReason(raw.reason());
        Set<UUID> seen = new HashSet<>();
        List<ReceiptItemInput> items = raw.items().stream().map(item -> {
            if (item == null || item.lineId() == null || !seen.add(item.lineId())) {
                throw problem(HttpStatus.BAD_REQUEST, "Cada línea recibida debe aparecer una sola vez.");
            }
            return new ReceiptItemInput(item.lineId(), positiveTwoDecimals(item.weight(), "peso recibido"));
        }).toList();
        return new CorrectionInput(raw.expectedVersion(), raw.effectiveAt(), items, reason);
    }

    private static void validateEffectiveAt(OffsetDateTime effectiveAt) {
        if (effectiveAt.toInstant().isAfter(Instant.now().plusSeconds(300))) {
            throw problem(HttpStatus.BAD_REQUEST, "La recepción no puede tener fecha y hora futuras.");
        }
    }

    private static BigDecimal positiveTwoDecimals(BigDecimal value, String label) {
        if (value == null || value.signum() <= 0 || value.scale() > 2
            || value.precision() - value.scale() > 12) {
            throw problem(HttpStatus.BAD_REQUEST,
                "El " + label + " debe ser positivo y tener como máximo dos decimales.");
        }
        return value.setScale(2, RoundingMode.UNNECESSARY);
    }

    static BigDecimal lineTotal(BigDecimal weight, BigDecimal pricePerGram) {
        return weight.multiply(pricePerGram).setScale(2, RoundingMode.HALF_UP);
    }

    private static String validateReason(String raw) {
        String reason = raw == null ? "" : raw.trim();
        if (reason.isEmpty() || reason.length() > 500) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica un motivo de 1 a 500 caracteres.");
        }
        return reason;
    }

    private String snapshotJson(UUID purchaseId) {
        return snapshotJson(get(purchaseId), purchases.lines(purchaseId));
    }

    private String snapshotJson(Purchase purchase, List<PurchaseLine> lines) {
        return json.writeValueAsString(Map.of(
            "supplierId", purchase.supplierId().toString(),
            "operationDate", purchase.operationDate().toString(),
            "status", purchase.status(),
            "lines", lines.stream().map(line -> Map.of(
                "lineId", line.id().toString(),
                "categoryCode", line.categoryCode(),
                "lengthCm", line.lengthCm(),
                "agreedWeight", line.agreedWeight(),
                "receivedWeight", line.receivedWeight(),
                "pricePerGram", line.pricePerGram()
            )).toList()
        ));
    }

    private String snapshotMovementJson(Purchase purchase, List<PurchaseLine> lines,
                                        Receipt receipt, List<ReceiptItem> items) {
        Map<String, Object> movement = new LinkedHashMap<>();
        movement.put("id", receipt.id().toString());
        movement.put("effectiveAt", receipt.effectiveAt().toString());
        movement.put("recordedAt", receipt.recordedAt().toString());
        movement.put("voidedAt", receipt.voidedAt() == null ? null : receipt.voidedAt().toString());
        movement.put("items", items.stream().map(item -> Map.of(
            "receiptItemId", item.id().toString(),
            "lineId", item.purchaseLineId().toString(),
            "weight", item.weight()
        )).toList());
        return json.writeValueAsString(Map.of(
            "purchase", json.readTree(snapshotJson(purchase, lines)),
            "receipt", movement
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

    private static PurchaseProblem problem(HttpStatus status, String message) {
        return new PurchaseProblem(status, message);
    }

    record LineInput(String categoryCode, Integer lengthCm, BigDecimal weight, BigDecimal pricePerGram) {}
    record CreateInput(UUID requestKey, UUID supplierId, LocalDate operationDate,
                       List<LineInput> lines, boolean receiveNow, OffsetDateTime effectiveAt) {}
    record ReceiptItemInput(UUID lineId, BigDecimal weight) {}
    record ReceiptInput(UUID requestKey, OffsetDateTime effectiveAt, List<ReceiptItemInput> items) {}
    record EditLineInput(UUID id, String categoryCode, Integer lengthCm,
                         BigDecimal weight, BigDecimal pricePerGram) {}
    record EditInput(Long expectedVersion, UUID supplierId, LocalDate operationDate,
                     List<EditLineInput> lines, String reason) {}
    record CorrectionInput(Long expectedVersion, OffsetDateTime effectiveAt,
                           List<ReceiptItemInput> items, String reason) {}
    record VoidReceiptInput(Long expectedVersion, String reason) {}
    private record ReceiptFingerprint(UUID purchaseId, ReceiptInput input) {}

    static final class PurchaseProblem extends RuntimeException {
        private final HttpStatus status;

        PurchaseProblem(HttpStatus status, String message) {
            super(message);
            this.status = status;
        }

        HttpStatus status() { return status; }
    }
}
