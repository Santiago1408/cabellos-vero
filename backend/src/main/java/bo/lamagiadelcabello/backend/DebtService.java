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
import java.util.Map;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;

import bo.lamagiadelcabello.backend.DebtRepository.Debt;
import bo.lamagiadelcabello.backend.DebtRepository.DebtData;
import bo.lamagiadelcabello.backend.DebtRepository.History;
import bo.lamagiadelcabello.backend.DebtRepository.Payment;
import bo.lamagiadelcabello.backend.DebtRepository.PaymentData;

@Service
class DebtService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/La_Paz");
    private final DebtRepository debts;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    DebtService(DebtRepository debts, TransactionTemplate transactions, ObjectMapper json) {
        this.debts = debts;
        this.transactions = transactions;
        this.json = json;
    }

    List<Debt> list() { return debts.list(); }

    Debt get(UUID id) {
        return debts.debt(id).orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Deuda no encontrada."));
    }

    List<Payment> payments(UUID debtId) {
        get(debtId);
        return debts.payments(debtId);
    }

    List<History> history(UUID debtId) {
        get(debtId);
        return debts.history(debtId);
    }

    BigDecimal paid(UUID debtId) { return debts.paid(debtId); }

    String state(Debt debt, BigDecimal paid) {
        if (debt.total().compareTo(paid) == 0) return "PAID";
        if (debt.dueOn().isBefore(LocalDate.now(BUSINESS_ZONE))) return "OVERDUE";
        return paid.signum() > 0 ? "PARTIAL" : "PENDING";
    }

    Debt create(CreateInput raw, UUID actorId) {
        if (raw == null || raw.requestKey() == null) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica una clave única para la deuda.");
        }
        DebtData data = validateDebt(raw.data());
        String hash = fingerprint(data);
        Debt previous = debts.debtByRequestKey(raw.requestKey()).orElse(null);
        if (previous != null) return sameDebtRequest(previous, hash);
        try {
            return transactions.execute(status -> {
                Debt duplicate = debts.debtByRequestKey(raw.requestKey()).orElse(null);
                if (duplicate != null) return sameDebtRequest(duplicate, hash);
                UUID id = UUID.randomUUID();
                debts.createDebt(id, raw.requestKey(), hash, data);
                Debt created = get(id);
                debts.addHistory(id, null, "DEBT_CREATED", actorId, null,
                    null, debtJson(created));
                return created;
            });
        } catch (DataIntegrityViolationException conflict) {
            Debt duplicate = debts.debtByRequestKey(raw.requestKey()).orElse(null);
            if (duplicate != null) return sameDebtRequest(duplicate, hash);
            throw problem(HttpStatus.CONFLICT, "La deuda no pudo registrarse por un cambio simultáneo.");
        }
    }

    Debt edit(UUID id, EditInput raw, UUID actorId) {
        if (raw == null) throw problem(HttpStatus.BAD_REQUEST, "Faltan los datos de la deuda.");
        long version = version(raw.expectedVersion());
        String reason = reason(raw.reason());
        DebtData data = validateDebt(raw.data());
        return transactions.execute(status -> {
            Debt before = lockedAtVersion(id, version);
            if (sameDebt(before, data)) {
                throw problem(HttpStatus.BAD_REQUEST, "No hay cambios en la deuda.");
            }
            if (data.total().compareTo(debts.paid(id)) < 0) {
                throw problem(HttpStatus.CONFLICT,
                    "El importe de la deuda no puede ser inferior a los abonos vigentes.");
            }
            if (debts.paymentBefore(id, data.openedOn())) {
                throw problem(HttpStatus.CONFLICT,
                    "La fecha de registro no puede ser posterior a un abono, incluso si fue anulado.");
            }
            debts.updateDebt(id, data);
            Debt after = get(id);
            debts.addHistory(id, null, "DEBT_UPDATED", actorId, reason,
                debtJson(before), debtJson(after));
            return after;
        });
    }

    Debt recordPayment(UUID id, CreatePaymentInput raw, UUID actorId) {
        if (raw == null || raw.requestKey() == null) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica una clave única para el abono.");
        }
        PaymentData data = validatePayment(raw.data());
        String hash = fingerprint(data);
        Payment previous = debts.paymentByRequestKey(raw.requestKey()).orElse(null);
        if (previous != null) return samePaymentRequest(previous, id, hash);
        try {
            return transactions.execute(status -> {
                Debt debt = locked(id);
                Payment duplicate = debts.paymentByRequestKey(raw.requestKey()).orElse(null);
                if (duplicate != null) return samePaymentRequest(duplicate, id, hash);
                requirePaymentDate(data.paidOn(), debt.openedOn());
                requireWithinTotal(debts.paid(id).add(data.amount()), debt.total());
                UUID paymentId = UUID.randomUUID();
                debts.createPayment(paymentId, id, raw.requestKey(), hash, data);
                debts.touch(id);
                Payment payment = debts.payment(paymentId).orElseThrow();
                debts.addHistory(id, paymentId, "PAYMENT_RECORDED", actorId, null,
                    null, paymentJson(payment));
                return get(id);
            });
        } catch (DataIntegrityViolationException conflict) {
            Payment duplicate = debts.paymentByRequestKey(raw.requestKey()).orElse(null);
            if (duplicate != null) return samePaymentRequest(duplicate, id, hash);
            throw problem(HttpStatus.CONFLICT, "El abono no pudo registrarse por un cambio simultáneo.");
        }
    }

    Debt correctPayment(UUID id, UUID paymentId, EditPaymentInput raw, UUID actorId) {
        if (raw == null) throw problem(HttpStatus.BAD_REQUEST, "Faltan los datos del abono.");
        long version = version(raw.expectedVersion());
        String reason = reason(raw.reason());
        PaymentData data = validatePayment(raw.data());
        return transactions.execute(status -> {
            Debt debt = lockedAtVersion(id, version);
            Payment before = activePayment(id, paymentId);
            requirePaymentDate(data.paidOn(), debt.openedOn());
            if (before.paidOn().equals(data.paidOn())
                && before.amount().compareTo(data.amount()) == 0
                && before.note().equals(data.note())) {
                throw problem(HttpStatus.BAD_REQUEST, "No hay cambios en el abono.");
            }
            requireWithinTotal(debts.paid(id).subtract(before.amount()).add(data.amount()),
                debt.total());
            debts.updatePayment(paymentId, data);
            debts.touch(id);
            Payment after = debts.payment(paymentId).orElseThrow();
            debts.addHistory(id, paymentId, "PAYMENT_CORRECTED", actorId, reason,
                paymentJson(before), paymentJson(after));
            return get(id);
        });
    }

    Debt voidPayment(UUID id, UUID paymentId, VoidInput raw, UUID actorId) {
        if (raw == null) throw problem(HttpStatus.BAD_REQUEST, "Faltan los datos de anulación.");
        long version = version(raw.expectedVersion());
        String reason = reason(raw.reason());
        return transactions.execute(status -> {
            lockedAtVersion(id, version);
            Payment before = activePayment(id, paymentId);
            debts.voidPayment(paymentId);
            debts.touch(id);
            Payment after = debts.payment(paymentId).orElseThrow();
            debts.addHistory(id, paymentId, "PAYMENT_VOIDED", actorId, reason,
                paymentJson(before), paymentJson(after));
            return get(id);
        });
    }

    private Debt locked(UUID id) {
        return debts.lockedDebt(id).orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Deuda no encontrada."));
    }

    private Debt lockedAtVersion(UUID id, long expectedVersion) {
        Debt debt = locked(id);
        if (debt.version() != expectedVersion) {
            throw problem(HttpStatus.CONFLICT,
                "La deuda cambió desde que la abriste. Recarga el detalle antes de continuar.");
        }
        return debt;
    }

    private Payment activePayment(UUID debtId, UUID paymentId) {
        Payment payment = debts.payment(paymentId)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Abono no encontrado."));
        if (!payment.debtId().equals(debtId)) {
            throw problem(HttpStatus.NOT_FOUND, "Abono no encontrado en esta deuda.");
        }
        if (payment.voidedAt() != null) {
            throw problem(HttpStatus.CONFLICT, "El abono ya fue anulado.");
        }
        return payment;
    }

    private Debt sameDebtRequest(Debt debt, String hash) {
        if (!debt.requestHash().equals(hash)) {
            throw problem(HttpStatus.CONFLICT, "La clave de deuda ya se usó con otros datos.");
        }
        return debt;
    }

    private Debt samePaymentRequest(Payment payment, UUID debtId, String hash) {
        if (!payment.debtId().equals(debtId) || !payment.requestHash().equals(hash)) {
            throw problem(HttpStatus.CONFLICT, "La clave de abono ya se usó con otros datos.");
        }
        return get(debtId);
    }

    private static DebtData validateDebt(DebtData raw) {
        if (raw == null) throw problem(HttpStatus.BAD_REQUEST, "Faltan los datos de la deuda.");
        String party = trimmed(raw.party()).replaceAll("\\s+", " ");
        String phone = trimmed(raw.phone());
        String notes = trimmed(raw.notes());
        if (party.isEmpty() || party.length() > 160 || phone.isEmpty() || phone.length() > 40) {
            throw problem(HttpStatus.BAD_REQUEST,
                "La persona o empresa y el teléfono son obligatorios y deben tener un tamaño válido.");
        }
        if (!"RECEIVABLE".equals(raw.kind()) && !"PAYABLE".equals(raw.kind())) {
            throw problem(HttpStatus.BAD_REQUEST, "El tipo debe ser RECEIVABLE o PAYABLE.");
        }
        BigDecimal total = money(raw.total(), "El importe de la deuda");
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        if (raw.openedOn() == null || raw.openedOn().isAfter(today)
            || raw.dueOn() == null || raw.dueOn().isBefore(raw.openedOn())) {
            throw problem(HttpStatus.BAD_REQUEST,
                "La fecha de registro no puede ser futura y el vencimiento debe ser igual o posterior.");
        }
        if (notes.length() > 2000) {
            throw problem(HttpStatus.BAD_REQUEST, "Las notas no pueden superar 2000 caracteres.");
        }
        return new DebtData(party, phone, raw.kind(), total, raw.openedOn(), raw.dueOn(), notes);
    }

    private static PaymentData validatePayment(PaymentData raw) {
        if (raw == null || raw.paidOn() == null
            || raw.paidOn().isAfter(LocalDate.now(BUSINESS_ZONE))) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica una fecha de abono real que no sea futura.");
        }
        BigDecimal amount = money(raw.amount(), "El importe del abono");
        String note = trimmed(raw.note());
        if (note.length() > 1000) {
            throw problem(HttpStatus.BAD_REQUEST, "La nota del abono no puede superar 1000 caracteres.");
        }
        return new PaymentData(raw.paidOn(), amount, note);
    }

    private static BigDecimal money(BigDecimal value, String label) {
        if (value == null || value.signum() <= 0 || value.scale() > 2
            || value.precision() - value.scale() > 12) {
            throw problem(HttpStatus.BAD_REQUEST,
                label + " debe ser positivo y tener como máximo dos decimales.");
        }
        return value.setScale(2, RoundingMode.UNNECESSARY);
    }

    private static void requirePaymentDate(LocalDate paidOn, LocalDate openedOn) {
        if (paidOn.isBefore(openedOn)) {
            throw problem(HttpStatus.BAD_REQUEST,
                "La fecha del abono no puede ser anterior al registro de la deuda.");
        }
    }

    private static void requireWithinTotal(BigDecimal paid, BigDecimal total) {
        if (paid.compareTo(total) > 0) {
            throw problem(HttpStatus.CONFLICT,
                "Los abonos sumarían " + paid + " Bs y superarían la deuda de " + total + " Bs.");
        }
    }

    private static boolean sameDebt(Debt before, DebtData after) {
        return before.party().equals(after.party()) && before.phone().equals(after.phone())
            && before.kind().equals(after.kind()) && before.total().compareTo(after.total()) == 0
            && before.openedOn().equals(after.openedOn()) && before.dueOn().equals(after.dueOn())
            && before.notes().equals(after.notes());
    }

    private String debtJson(Debt debt) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("party", debt.party());
        value.put("phone", debt.phone());
        value.put("kind", debt.kind());
        value.put("total", debt.total());
        value.put("openedOn", debt.openedOn());
        value.put("dueOn", debt.dueOn());
        value.put("notes", debt.notes());
        return json.writeValueAsString(value);
    }

    private String paymentJson(Payment payment) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("id", payment.id());
        value.put("paidOn", payment.paidOn());
        value.put("amount", payment.amount());
        value.put("note", payment.note());
        value.put("voidedAt", payment.voidedAt());
        return json.writeValueAsString(value);
    }

    private String fingerprint(Object value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(json.writeValueAsBytes(value)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 no está disponible.", impossible);
        }
    }

    private static long version(Long value) {
        if (value == null || value < 0) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica la versión actual de la deuda.");
        }
        return value;
    }

    private static String reason(String raw) {
        String value = trimmed(raw);
        if (value.isEmpty() || value.length() > 500) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica un motivo de 1 a 500 caracteres.");
        }
        return value;
    }

    private static String trimmed(String raw) { return raw == null ? "" : raw.trim(); }
    private static DebtProblem problem(HttpStatus status, String message) {
        return new DebtProblem(status, message);
    }

    static final class DebtProblem extends RuntimeException {
        private final HttpStatus status;
        DebtProblem(HttpStatus status, String message) { super(message); this.status = status; }
        HttpStatus status() { return status; }
    }

    record CreateInput(UUID requestKey, DebtData data) {}
    record EditInput(Long expectedVersion, DebtData data, String reason) {}
    record CreatePaymentInput(UUID requestKey, PaymentData data) {}
    record EditPaymentInput(Long expectedVersion, PaymentData data, String reason) {}
    record VoidInput(Long expectedVersion, String reason) {}
}
