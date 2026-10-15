package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;

import bo.lamagiadelcabello.backend.PurchasePaymentRepository.Payment;
import bo.lamagiadelcabello.backend.PurchaseRepository.Purchase;
import bo.lamagiadelcabello.backend.PurchaseRepository.PurchaseLine;
import bo.lamagiadelcabello.backend.PurchaseService.PurchaseProblem;

@Service
class PurchasePaymentService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/La_Paz");

    private final PurchaseRepository purchases;
    private final PurchasePaymentRepository payments;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    PurchasePaymentService(PurchaseRepository purchases, PurchasePaymentRepository payments,
                           TransactionTemplate transactions, ObjectMapper json) {
        this.purchases = purchases;
        this.payments = payments;
        this.transactions = transactions;
        this.json = json;
    }

    Purchase create(UUID purchaseId, CreateInput raw, UUID actorId) {
        CreateInput input = validateCreate(raw);
        String hash = fingerprint(input);
        Payment repeated = payments.findByRequestKey(input.requestKey()).orElse(null);
        if (repeated != null) return sameRequest(repeated, purchaseId, hash);
        try {
            return transactions.execute(status -> {
                Purchase purchase = lockedPurchase(purchaseId);
                Payment duplicate = payments.findByRequestKey(input.requestKey()).orElse(null);
                if (duplicate != null) return sameRequest(duplicate, purchaseId, hash);
                BigDecimal payable = payableTotal(purchase, purchases.lines(purchaseId));
                BigDecimal paid = payments.totalActive(purchaseId);
                requireWithinPayable(paid.add(input.amount()), payable);
                String before = snapshotJson(purchase, null);
                UUID paymentId = UUID.randomUUID();
                payments.create(paymentId, purchaseId, input.requestKey(), hash,
                    input.paymentDate(), input.amount(), input.method(), input.reference());
                purchases.touch(purchaseId);
                Purchase after = getPurchase(purchaseId);
                Payment payment = payments.findById(paymentId).orElseThrow();
                purchases.addHistory(purchaseId, "PAYMENT_RECORDED", actorId, null,
                    before, snapshotJson(after, payment));
                return after;
            });
        } catch (DataIntegrityViolationException conflict) {
            Payment duplicate = payments.findByRequestKey(input.requestKey()).orElse(null);
            if (duplicate != null) return sameRequest(duplicate, purchaseId, hash);
            throw problem(HttpStatus.CONFLICT, "El pago no pudo registrarse por un cambio simultáneo.");
        }
    }

    Purchase correct(UUID purchaseId, UUID paymentId, CorrectionInput raw, UUID actorId) {
        CorrectionInput input = validateCorrection(raw);
        return transactions.execute(status -> {
            Purchase purchase = lockedAtVersion(purchaseId, input.expectedVersion());
            Payment payment = activePayment(purchaseId, paymentId);
            if (payment.paymentDate().equals(input.paymentDate())
                && payment.amount().compareTo(input.amount()) == 0
                && payment.method().equals(input.method())
                && java.util.Objects.equals(payment.reference(), input.reference())) {
                throw problem(HttpStatus.BAD_REQUEST, "No hay cambios en el pago.");
            }
            BigDecimal payable = payableTotal(purchase, purchases.lines(purchaseId));
            BigDecimal afterPaid = payments.totalActive(purchaseId)
                .subtract(payment.amount()).add(input.amount());
            requireWithinPayable(afterPaid, payable);
            String before = snapshotJson(purchase, payment);
            payments.update(paymentId, input.paymentDate(), input.amount(),
                input.method(), input.reference());
            purchases.touch(purchaseId);
            Purchase after = getPurchase(purchaseId);
            purchases.addHistory(purchaseId, "PAYMENT_CORRECTED", actorId, input.reason(),
                before, snapshotJson(after, payments.findById(paymentId).orElseThrow()));
            return after;
        });
    }

    Purchase voidPayment(UUID purchaseId, UUID paymentId, VoidInput raw, UUID actorId) {
        if (raw == null || raw.expectedVersion() == null || raw.expectedVersion() < 0) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica la versión actual de la compra.");
        }
        String reason = reason(raw.reason());
        return transactions.execute(status -> {
            Purchase purchase = lockedAtVersion(purchaseId, raw.expectedVersion());
            Payment payment = activePayment(purchaseId, paymentId);
            String before = snapshotJson(purchase, payment);
            payments.voidPayment(paymentId);
            purchases.touch(purchaseId);
            Purchase after = getPurchase(purchaseId);
            purchases.addHistory(purchaseId, "PAYMENT_VOIDED", actorId, reason,
                before, snapshotJson(after, payments.findById(paymentId).orElseThrow()));
            return after;
        });
    }

    static BigDecimal payableTotal(Purchase purchase, List<PurchaseLine> lines) {
        boolean receivedOnly = purchase.status().equals("CANCELED");
        return lines.stream().map(line -> PurchaseService.lineTotal(
                receivedOnly ? line.receivedWeight() : line.agreedWeight(), line.pricePerGram()))
            .reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
    }

    static void requireWithinPayable(BigDecimal paid, BigDecimal payable) {
        if (paid.compareTo(payable) > 0) {
            throw problem(HttpStatus.CONFLICT,
                "El total pagado sería " + paid + " Bs y supera el importe exigible de "
                    + payable + " Bs.");
        }
    }

    private Purchase getPurchase(UUID id) {
        return purchases.findById(id)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Compra no encontrada."));
    }

    private Purchase lockedPurchase(UUID id) {
        return purchases.findByIdForUpdate(id)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Compra no encontrada."));
    }

    private Purchase lockedAtVersion(UUID id, long expectedVersion) {
        Purchase purchase = lockedPurchase(id);
        if (purchase.version() != expectedVersion) {
            throw problem(HttpStatus.CONFLICT,
                "La compra cambió desde que la abriste. Recarga el detalle antes de continuar.");
        }
        return purchase;
    }

    private Payment activePayment(UUID purchaseId, UUID paymentId) {
        Payment payment = payments.findById(paymentId)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Pago no encontrado."));
        if (!payment.purchaseId().equals(purchaseId)) {
            throw problem(HttpStatus.NOT_FOUND, "Pago no encontrado en esta compra.");
        }
        if (payment.voidedAt() != null) {
            throw problem(HttpStatus.CONFLICT, "El pago ya fue anulado.");
        }
        return payment;
    }

    private Purchase sameRequest(Payment payment, UUID purchaseId, String hash) {
        if (!payment.purchaseId().equals(purchaseId) || !payment.requestHash().equals(hash)) {
            throw problem(HttpStatus.CONFLICT, "La clave de pago ya se usó con otros datos.");
        }
        return getPurchase(purchaseId);
    }

    private CreateInput validateCreate(CreateInput raw) {
        if (raw == null || raw.requestKey() == null) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica una clave única para este pago.");
        }
        PaymentData data = validateData(raw.paymentDate(), raw.amount(), raw.method(), raw.reference());
        return new CreateInput(raw.requestKey(), data.paymentDate(), data.amount(),
            data.method(), data.reference());
    }

    private CorrectionInput validateCorrection(CorrectionInput raw) {
        if (raw == null || raw.expectedVersion() == null || raw.expectedVersion() < 0) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica la versión actual de la compra.");
        }
        String reason = reason(raw.reason());
        PaymentData data = validateData(raw.paymentDate(), raw.amount(), raw.method(), raw.reference());
        return new CorrectionInput(raw.expectedVersion(), data.paymentDate(), data.amount(),
            data.method(), data.reference(), reason);
    }

    private PaymentData validateData(LocalDate paymentDate, BigDecimal amount,
                                     String rawMethod, String rawReference) {
        if (paymentDate == null || paymentDate.isAfter(LocalDate.now(BUSINESS_ZONE))) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica una fecha de pago real que no sea futura.");
        }
        if (amount == null || amount.signum() <= 0 || amount.scale() > 2
            || amount.precision() - amount.scale() > 12) {
            throw problem(HttpStatus.BAD_REQUEST,
                "El importe debe ser positivo y tener como máximo dos decimales.");
        }
        String method = rawMethod == null ? "" : rawMethod.trim().toUpperCase(Locale.ROOT);
        if (!List.of("CASH", "QR", "TRANSFER", "OTHER").contains(method)) {
            throw problem(HttpStatus.BAD_REQUEST,
                "El método debe ser CASH, QR, TRANSFER u OTHER.");
        }
        String reference = rawReference == null ? null : rawReference.trim();
        if (reference != null && reference.length() > 200) {
            throw problem(HttpStatus.BAD_REQUEST, "La referencia no puede superar 200 caracteres.");
        }
        if (reference != null && reference.isEmpty()) reference = null;
        return new PaymentData(paymentDate, amount.setScale(2, RoundingMode.UNNECESSARY),
            method, reference);
    }

    private static String reason(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty() || value.length() > 500) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica un motivo de 1 a 500 caracteres.");
        }
        return value;
    }

    private String snapshotJson(Purchase purchase, Payment payment) {
        BigDecimal payable = payableTotal(purchase, purchases.lines(purchase.id()));
        BigDecimal paid = payments.totalActive(purchase.id());
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("payableTotal", payable);
        snapshot.put("paidTotal", paid);
        snapshot.put("balance", payable.subtract(paid));
        if (payment == null) {
            snapshot.put("payment", null);
        } else {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("id", payment.id().toString());
            data.put("paymentDate", payment.paymentDate().toString());
            data.put("amount", payment.amount());
            data.put("method", payment.method());
            data.put("reference", payment.reference());
            data.put("recordedAt", payment.recordedAt().toString());
            data.put("voidedAt", payment.voidedAt() == null ? null : payment.voidedAt().toString());
            snapshot.put("payment", data);
        }
        return json.writeValueAsString(snapshot);
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

    private record PaymentData(LocalDate paymentDate, BigDecimal amount,
                               String method, String reference) {}
    record CreateInput(UUID requestKey, LocalDate paymentDate, BigDecimal amount,
                       String method, String reference) {}
    record CorrectionInput(Long expectedVersion, LocalDate paymentDate, BigDecimal amount,
                           String method, String reference, String reason) {}
    record VoidInput(Long expectedVersion, String reason) {}
}
