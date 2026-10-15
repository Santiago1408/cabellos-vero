package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;

import bo.lamagiadelcabello.backend.SalePaymentRepository.Payment;
import bo.lamagiadelcabello.backend.SaleRepository.Sale;
import bo.lamagiadelcabello.backend.SaleRepository.SaleLine;
import bo.lamagiadelcabello.backend.SaleService.SaleProblem;

@Service
class SalePaymentService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/La_Paz");

    private final SaleRepository sales;
    private final SalePaymentRepository payments;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    SalePaymentService(SaleRepository sales, SalePaymentRepository payments,
                       TransactionTemplate transactions, ObjectMapper json) {
        this.sales = sales;
        this.payments = payments;
        this.transactions = transactions;
        this.json = json;
    }

    Sale create(UUID saleId, CreateInput raw, UUID actorId) {
        CreateInput input = validateCreate(raw);
        String hash = fingerprint(input);
        Payment repeated = payments.findByRequestKey(input.requestKey()).orElse(null);
        if (repeated != null) return sameRequest(repeated, saleId, hash);
        try {
            return transactions.execute(status -> {
                Sale sale = lockedSale(saleId);
                Payment duplicate = payments.findByRequestKey(input.requestKey()).orElse(null);
                if (duplicate != null) return sameRequest(duplicate, saleId, hash);
                BigDecimal payable = payableTotal(sale, sales.lines(saleId));
                requireWithinPayable(payments.totalActive(saleId).add(input.amount()), payable);
                String before = snapshotJson(sale, null);
                UUID paymentId = UUID.randomUUID();
                payments.create(paymentId, saleId, input.requestKey(), hash,
                    input.paymentDate(), input.amount(), input.method(), input.reference());
                sales.touch(saleId);
                Sale after = getSale(saleId);
                sales.addHistory(saleId, "COLLECTION_RECORDED", actorId, null,
                    before, snapshotJson(after, payments.findById(paymentId).orElseThrow()));
                return after;
            });
        } catch (DataIntegrityViolationException conflict) {
            Payment duplicate = payments.findByRequestKey(input.requestKey()).orElse(null);
            if (duplicate != null) return sameRequest(duplicate, saleId, hash);
            throw problem(HttpStatus.CONFLICT, "PAYMENT_CONFLICT",
                "El cobro no pudo registrarse por un cambio simultáneo.");
        }
    }

    Sale correct(UUID saleId, UUID paymentId, CorrectionInput raw, UUID actorId) {
        CorrectionInput input = validateCorrection(raw);
        return transactions.execute(status -> {
            Sale sale = lockedAtVersion(saleId, input.expectedVersion());
            Payment payment = activePayment(saleId, paymentId);
            if (payment.paymentDate().equals(input.paymentDate())
                && payment.amount().compareTo(input.amount()) == 0
                && payment.method().equals(input.method())
                && Objects.equals(payment.reference(), input.reference())) {
                throw problem(HttpStatus.BAD_REQUEST, "NO_CHANGES", "No hay cambios en el cobro.");
            }
            BigDecimal afterPaid = payments.totalActive(saleId)
                .subtract(payment.amount()).add(input.amount());
            requireWithinPayable(afterPaid, payableTotal(sale, sales.lines(saleId)));
            String before = snapshotJson(sale, payment);
            payments.update(paymentId, input.paymentDate(), input.amount(),
                input.method(), input.reference());
            sales.touch(saleId);
            Sale after = getSale(saleId);
            sales.addHistory(saleId, "COLLECTION_CORRECTED", actorId, input.reason(),
                before, snapshotJson(after, payments.findById(paymentId).orElseThrow()));
            return after;
        });
    }

    Sale voidPayment(UUID saleId, UUID paymentId, VoidInput raw, UUID actorId) {
        if (raw == null || raw.expectedVersion() == null || raw.expectedVersion() < 0) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_VERSION",
                "Indica la versión actual de la venta.");
        }
        String reason = reason(raw.reason());
        return transactions.execute(status -> {
            Sale sale = lockedAtVersion(saleId, raw.expectedVersion());
            Payment payment = activePayment(saleId, paymentId);
            String before = snapshotJson(sale, payment);
            payments.voidPayment(paymentId);
            sales.touch(saleId);
            Sale after = getSale(saleId);
            sales.addHistory(saleId, "COLLECTION_VOIDED", actorId, reason,
                before, snapshotJson(after, payments.findById(paymentId).orElseThrow()));
            return after;
        });
    }

    static BigDecimal payableTotal(Sale sale, List<SaleLine> lines) {
        boolean deliveredOnly = sale.status().equals("CANCELED");
        return lines.stream().map(line -> PurchaseService.lineTotal(
                deliveredOnly ? line.deliveredWeight() : line.agreedWeight(),
                line.pricePerGram()))
            .reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
    }

    static void requireWithinPayable(BigDecimal paid, BigDecimal payable) {
        if (paid.compareTo(payable) > 0) {
            throw problem(HttpStatus.CONFLICT, "PAYMENT_EXCEEDS_TOTAL",
                "El total cobrado sería " + paid + " Bs y supera el importe exigible de "
                    + payable + " Bs.");
        }
    }

    private Sale getSale(UUID id) {
        return sales.findById(id).orElseThrow(() ->
            problem(HttpStatus.NOT_FOUND, "SALE_NOT_FOUND", "Venta no encontrada."));
    }

    private Sale lockedSale(UUID id) {
        return sales.findByIdForUpdate(id).orElseThrow(() ->
            problem(HttpStatus.NOT_FOUND, "SALE_NOT_FOUND", "Venta no encontrada."));
    }

    private Sale lockedAtVersion(UUID id, long expectedVersion) {
        Sale sale = lockedSale(id);
        if (sale.version() != expectedVersion) {
            throw problem(HttpStatus.CONFLICT, "SALE_VERSION_CONFLICT",
                "La venta cambió desde que la abriste. Recarga el detalle antes de continuar.");
        }
        return sale;
    }

    private Payment activePayment(UUID saleId, UUID paymentId) {
        Payment payment = payments.findById(paymentId).orElseThrow(() ->
            problem(HttpStatus.NOT_FOUND, "PAYMENT_NOT_FOUND", "Cobro no encontrado."));
        if (!payment.saleId().equals(saleId)) {
            throw problem(HttpStatus.NOT_FOUND, "PAYMENT_NOT_FOUND",
                "Cobro no encontrado en esta venta.");
        }
        if (payment.voidedAt() != null) {
            throw problem(HttpStatus.CONFLICT, "PAYMENT_VOIDED", "El cobro ya fue anulado.");
        }
        return payment;
    }

    private Sale sameRequest(Payment payment, UUID saleId, String hash) {
        if (!payment.saleId().equals(saleId) || !payment.requestHash().equals(hash)) {
            throw problem(HttpStatus.CONFLICT, "REQUEST_KEY_REUSED",
                "La clave de cobro ya se usó con otros datos.");
        }
        return getSale(saleId);
    }

    private CreateInput validateCreate(CreateInput raw) {
        if (raw == null || raw.requestKey() == null) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_PAYMENT",
                "Indica una clave única para este cobro.");
        }
        PaymentData data = validateData(raw.paymentDate(), raw.amount(),
            raw.method(), raw.reference());
        return new CreateInput(raw.requestKey(), data.paymentDate(), data.amount(),
            data.method(), data.reference());
    }

    private CorrectionInput validateCorrection(CorrectionInput raw) {
        if (raw == null || raw.expectedVersion() == null || raw.expectedVersion() < 0) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_VERSION",
                "Indica la versión actual de la venta.");
        }
        String reason = reason(raw.reason());
        PaymentData data = validateData(raw.paymentDate(), raw.amount(),
            raw.method(), raw.reference());
        return new CorrectionInput(raw.expectedVersion(), data.paymentDate(), data.amount(),
            data.method(), data.reference(), reason);
    }

    private PaymentData validateData(LocalDate paymentDate, BigDecimal amount,
                                     String rawMethod, String rawReference) {
        if (paymentDate == null || paymentDate.isAfter(LocalDate.now(BUSINESS_ZONE))) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_PAYMENT_DATE",
                "Indica una fecha de cobro real que no sea futura.");
        }
        if (amount == null || amount.signum() <= 0 || amount.scale() > 2
            || amount.precision() - amount.scale() > 12) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_AMOUNT",
                "El importe debe ser positivo y tener como máximo dos decimales.");
        }
        String method = rawMethod == null ? "" : rawMethod.trim().toUpperCase(Locale.ROOT);
        if (!List.of("CASH", "QR", "TRANSFER", "OTHER").contains(method)) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_METHOD",
                "El método debe ser CASH, QR, TRANSFER u OTHER.");
        }
        String reference = rawReference == null ? null : rawReference.trim();
        if (reference != null && reference.length() > 200) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_REFERENCE",
                "La referencia no puede superar 200 caracteres.");
        }
        if (reference != null && reference.isEmpty()) reference = null;
        return new PaymentData(paymentDate, amount.setScale(2, RoundingMode.UNNECESSARY),
            method, reference);
    }

    private static String reason(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty() || value.length() > 500) {
            throw problem(HttpStatus.BAD_REQUEST, "INVALID_REASON",
                "Indica un motivo de 1 a 500 caracteres.");
        }
        return value;
    }

    private String snapshotJson(Sale sale, Payment payment) {
        BigDecimal payable = payableTotal(sale, sales.lines(sale.id()));
        BigDecimal paid = payments.totalActive(sale.id());
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

    private static SaleProblem problem(HttpStatus status, String code, String message) {
        return new SaleProblem(status, code, message, List.of());
    }

    private record PaymentData(LocalDate paymentDate, BigDecimal amount,
                               String method, String reference) {}
    record CreateInput(UUID requestKey, LocalDate paymentDate, BigDecimal amount,
                       String method, String reference) {}
    record CorrectionInput(Long expectedVersion, LocalDate paymentDate, BigDecimal amount,
                           String method, String reference, String reason) {}
    record VoidInput(Long expectedVersion, String reason) {}
}
