package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import bo.lamagiadelcabello.backend.DebtRepository.Debt;
import bo.lamagiadelcabello.backend.DebtRepository.DebtData;
import bo.lamagiadelcabello.backend.DebtRepository.History;
import bo.lamagiadelcabello.backend.DebtRepository.Payment;
import bo.lamagiadelcabello.backend.DebtRepository.PaymentData;
import bo.lamagiadelcabello.backend.DebtService.DebtProblem;

@RestController
@RequestMapping("/api/debts")
class DebtController {

    private final DebtService debts;
    private final ObjectMapper json;

    DebtController(DebtService debts, ObjectMapper json) {
        this.debts = debts;
        this.json = json;
    }

    @GetMapping
    List<Summary> list() { return debts.list().stream().map(this::summary).toList(); }

    @GetMapping("/{id}")
    Detail detail(@PathVariable UUID id) { return detailOf(debts.get(id)); }

    @PostMapping
    ResponseEntity<Detail> create(@RequestBody CreateRequest input, Authentication authentication) {
        Debt created = debts.create(input == null ? null : input.toService(), actorId(authentication));
        return ResponseEntity.created(URI.create("/api/debts/" + created.id()))
            .body(detailOf(created));
    }

    @PutMapping("/{id}")
    Detail edit(@PathVariable UUID id, @RequestBody EditRequest input, Authentication authentication) {
        return detailOf(debts.edit(id, input == null ? null : input.toService(), actorId(authentication)));
    }

    @PostMapping("/{id}/payments")
    Detail recordPayment(@PathVariable UUID id, @RequestBody CreatePaymentRequest input,
                         Authentication authentication) {
        return detailOf(debts.recordPayment(id,
            input == null ? null : input.toService(), actorId(authentication)));
    }

    @PutMapping("/{id}/payments/{paymentId}")
    Detail correctPayment(@PathVariable UUID id, @PathVariable UUID paymentId,
                          @RequestBody EditPaymentRequest input, Authentication authentication) {
        return detailOf(debts.correctPayment(id, paymentId,
            input == null ? null : input.toService(), actorId(authentication)));
    }

    @PostMapping("/{id}/payments/{paymentId}/void")
    Detail voidPayment(@PathVariable UUID id, @PathVariable UUID paymentId,
                       @RequestBody VoidRequest input, Authentication authentication) {
        return detailOf(debts.voidPayment(id, paymentId,
            input == null ? null : input.toService(), actorId(authentication)));
    }

    @ExceptionHandler(DebtProblem.class)
    ResponseEntity<Map<String, String>> debtProblem(DebtProblem error) {
        return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
    }

    private Summary summary(Debt debt) {
        BigDecimal paid = debts.paid(debt.id());
        return new Summary(debt.id(), debt.party(), debt.phone(), debt.kind(), debt.total(),
            paid, debt.total().subtract(paid), debt.openedOn(), debt.dueOn(),
            debt.notes(), debts.state(debt, paid), debt.createdAt(), debt.updatedAt(),
            debt.version());
    }

    private Detail detailOf(Debt debt) {
        return new Detail(summary(debt), debts.payments(debt.id()).stream()
            .map(PaymentView::from).toList(), debts.history(debt.id()).stream()
            .map(this::historyView).toList());
    }

    private HistoryView historyView(History event) {
        return new HistoryView(event.id(), event.paymentId(), event.changedAt(),
            event.eventType(), event.actorUserId(), event.reason(),
            parse(event.oldJson()), parse(event.newJson()));
    }

    private JsonNode parse(String value) { return value == null ? null : json.readTree(value); }

    private static UUID actorId(Authentication authentication) {
        return ((AccountPrincipal) authentication.getPrincipal()).id();
    }

    record CreateRequest(UUID requestKey, String party, String phone, String kind,
                         BigDecimal total, LocalDate openedOn, LocalDate dueOn,
                         String notes) {
        DebtService.CreateInput toService() {
            return new DebtService.CreateInput(requestKey,
                new DebtData(party, phone, kind, total, openedOn, dueOn, notes));
        }
    }

    record EditRequest(Long expectedVersion, String party, String phone, String kind,
                       BigDecimal total, LocalDate openedOn, LocalDate dueOn,
                       String notes, String reason) {
        DebtService.EditInput toService() {
            return new DebtService.EditInput(expectedVersion,
                new DebtData(party, phone, kind, total, openedOn, dueOn, notes), reason);
        }
    }

    record CreatePaymentRequest(UUID requestKey, LocalDate paidOn, BigDecimal amount,
                                String note) {
        DebtService.CreatePaymentInput toService() {
            return new DebtService.CreatePaymentInput(requestKey,
                new PaymentData(paidOn, amount, note));
        }
    }

    record EditPaymentRequest(Long expectedVersion, LocalDate paidOn, BigDecimal amount,
                              String note, String reason) {
        DebtService.EditPaymentInput toService() {
            return new DebtService.EditPaymentInput(expectedVersion,
                new PaymentData(paidOn, amount, note), reason);
        }
    }

    record VoidRequest(Long expectedVersion, String reason) {
        DebtService.VoidInput toService() { return new DebtService.VoidInput(expectedVersion, reason); }
    }

    record Summary(UUID id, String party, String phone, String kind, BigDecimal total,
                   BigDecimal paid, BigDecimal balance, LocalDate openedOn, LocalDate dueOn,
                   String notes, String status, Instant createdAt, Instant updatedAt,
                   long version) {}

    record PaymentView(UUID id, LocalDate paidOn, BigDecimal amount, String note,
                       Instant recordedAt, Instant updatedAt, Instant voidedAt) {
        static PaymentView from(Payment payment) {
            return new PaymentView(payment.id(), payment.paidOn(), payment.amount(),
                payment.note(), payment.recordedAt(), payment.updatedAt(), payment.voidedAt());
        }
    }

    record HistoryView(long id, UUID paymentId, Instant changedAt, String eventType,
                       UUID actorUserId, String reason, JsonNode oldValues,
                       JsonNode newValues) {}

    record Detail(Summary debt, List<PaymentView> payments, List<HistoryView> history) {}
}
