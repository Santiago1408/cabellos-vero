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

@Service
class PurchaseService {

    private final PurchaseRepository purchases;
    private final SupplierRepository suppliers;
    private final CatalogRepository catalog;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    PurchaseService(PurchaseRepository purchases, SupplierRepository suppliers,
                    CatalogRepository catalog, TransactionTemplate transactions, ObjectMapper json) {
        this.purchases = purchases;
        this.suppliers = suppliers;
        this.catalog = catalog;
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

    Purchase cancel(UUID purchaseId, String rawReason, UUID actorId) {
        String reason = validateReason(rawReason);
        return transactions.execute(status -> {
            Purchase before = purchases.findByIdForUpdate(purchaseId)
                .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Compra no encontrada."));
            if (!before.status().equals("PENDING")) {
                throw problem(HttpStatus.CONFLICT, "Solo se puede anular el saldo de una compra pendiente.");
            }
            List<PurchaseLine> lines = purchases.lines(purchaseId);
            String oldValues = snapshotJson(before, lines);
            purchases.cancel(purchaseId);
            Purchase after = get(purchaseId);
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
            oldValues, snapshotJson(after, afterLines));
        return after;
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
