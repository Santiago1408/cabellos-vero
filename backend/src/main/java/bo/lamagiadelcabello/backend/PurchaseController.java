package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
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

import bo.lamagiadelcabello.backend.PurchaseRepository.History;
import bo.lamagiadelcabello.backend.PurchaseRepository.Purchase;
import bo.lamagiadelcabello.backend.PurchaseRepository.PurchaseLine;
import bo.lamagiadelcabello.backend.PurchaseRepository.Receipt;
import bo.lamagiadelcabello.backend.PurchaseRepository.ReceiptItem;
import bo.lamagiadelcabello.backend.PurchaseService.PurchaseProblem;
import bo.lamagiadelcabello.backend.PurchasePaymentRepository.Payment;

@RestController
@RequestMapping("/api/purchases")
class PurchaseController {

    private final PurchaseService purchases;
    private final PurchaseRepository repository;
    private final PurchasePaymentRepository paymentRepository;
    private final PurchasePaymentService paymentService;
    private final ObjectMapper json;

    PurchaseController(PurchaseService purchases, PurchaseRepository repository,
                       PurchasePaymentRepository paymentRepository,
                       PurchasePaymentService paymentService, ObjectMapper json) {
        this.purchases = purchases;
        this.repository = repository;
        this.paymentRepository = paymentRepository;
        this.paymentService = paymentService;
        this.json = json;
    }

    @GetMapping
    List<Summary> list() {
        return purchases.list().stream().map(this::summary).toList();
    }

    @GetMapping("/{id}")
    Detail detail(@PathVariable UUID id) {
        return detailOf(purchases.get(id));
    }

    @PostMapping
    ResponseEntity<Detail> create(@RequestBody CreateRequest input, Authentication authentication) {
        Purchase created = purchases.create(input == null ? null : input.toService(), actorId(authentication));
        return ResponseEntity.created(URI.create("/api/purchases/" + created.id()))
            .body(detailOf(created));
    }

    @PostMapping("/{id}/receipts")
    Detail receive(@PathVariable UUID id, @RequestBody ReceiptRequest input, Authentication authentication) {
        Purchase changed = purchases.receive(id, input == null ? null : input.toService(), actorId(authentication));
        return detailOf(changed);
    }

    @PutMapping("/{id}/receipts/{receiptId}")
    Detail correctReceipt(@PathVariable UUID id, @PathVariable UUID receiptId,
                          @RequestBody CorrectionRequest input, Authentication authentication) {
        Purchase changed = purchases.correctReceipt(id, receiptId,
            input == null ? null : input.toService(), actorId(authentication));
        return detailOf(changed);
    }

    @PostMapping("/{id}/receipts/{receiptId}/void")
    Detail voidReceipt(@PathVariable UUID id, @PathVariable UUID receiptId,
                       @RequestBody VoidReceiptRequest input, Authentication authentication) {
        Purchase changed = purchases.voidReceipt(id, receiptId,
            input == null ? null : input.toService(), actorId(authentication));
        return detailOf(changed);
    }

    @PutMapping("/{id}")
    Detail edit(@PathVariable UUID id, @RequestBody EditRequest input, Authentication authentication) {
        Purchase changed = purchases.edit(id, input == null ? null : input.toService(), actorId(authentication));
        return detailOf(changed);
    }

    @PostMapping("/{id}/cancel")
    Detail cancel(@PathVariable UUID id, @RequestBody ReasonRequest input, Authentication authentication) {
        Purchase changed = purchases.cancel(id, input == null ? null : input.reason(), actorId(authentication));
        return detailOf(changed);
    }

    @PostMapping("/{id}/payments")
    Detail recordPayment(@PathVariable UUID id, @RequestBody PaymentRequest input,
                         Authentication authentication) {
        Purchase changed = paymentService.create(id,
            input == null ? null : input.toService(), actorId(authentication));
        return detailOf(changed);
    }

    @PutMapping("/{id}/payments/{paymentId}")
    Detail correctPayment(@PathVariable UUID id, @PathVariable UUID paymentId,
                          @RequestBody PaymentCorrectionRequest input,
                          Authentication authentication) {
        Purchase changed = paymentService.correct(id, paymentId,
            input == null ? null : input.toService(), actorId(authentication));
        return detailOf(changed);
    }

    @PostMapping("/{id}/payments/{paymentId}/void")
    Detail voidPayment(@PathVariable UUID id, @PathVariable UUID paymentId,
                       @RequestBody PaymentVoidRequest input,
                       Authentication authentication) {
        Purchase changed = paymentService.voidPayment(id, paymentId,
            input == null ? null : input.toService(), actorId(authentication));
        return detailOf(changed);
    }

    @ExceptionHandler(PurchaseProblem.class)
    ResponseEntity<Map<String, String>> purchaseProblem(PurchaseProblem error) {
        return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
    }

    private Summary summary(Purchase purchase) {
        List<PurchaseLine> lines = repository.lines(purchase.id());
        BigDecimal agreedTotal = amount(lines, false);
        BigDecimal receivedValue = amount(lines, true);
        BigDecimal agreedWeight = lines.stream().map(PurchaseLine::agreedWeight)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal receivedWeight = lines.stream().map(PurchaseLine::receivedWeight)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal payableTotal = purchase.status().equals("CANCELED") ? receivedValue : agreedTotal;
        BigDecimal paidTotal = paymentRepository.totalActive(purchase.id());
        return new Summary(
            purchase.id(), purchase.supplierId(), purchase.supplierName(), purchase.operationDate(),
            purchase.status(), purchase.createdAt(), purchase.confirmedAt(), purchase.canceledAt(),
            purchase.updatedAt(), purchase.version(), agreedWeight, receivedWeight,
            agreedTotal, receivedValue, payableTotal, paidTotal,
            payableTotal.subtract(paidTotal)
        );
    }

    private Detail detailOf(Purchase purchase) {
        List<PurchaseLine> lines = repository.lines(purchase.id());
        List<ReceiptView> receipts = repository.receipts(purchase.id()).stream()
            .map(this::receiptView).toList();
        List<HistoryView> history = repository.history(purchase.id()).stream()
            .map(this::historyView).toList();
        return new Detail(summary(purchase), lines.stream().map(LineView::from).toList(),
            receipts, paymentRepository.list(purchase.id()).stream().map(PaymentView::from).toList(),
            history);
    }

    private ReceiptView receiptView(Receipt receipt) {
        return new ReceiptView(receipt.id(), receipt.effectiveAt(), receipt.recordedAt(),
            receipt.voidedAt(), repository.receiptItems(receipt.id()).stream()
                .map(ReceiptItemView::from).toList());
    }

    private HistoryView historyView(History row) {
        return new HistoryView(row.id(), row.changedAt(), row.eventType(), row.actorUserId(),
            row.reason(), parse(row.oldValuesJson()), parse(row.newValuesJson()));
    }

    private JsonNode parse(String value) { return value == null ? null : json.readTree(value); }

    private static BigDecimal amount(List<PurchaseLine> lines, boolean received) {
        return lines.stream().map(line -> PurchaseService.lineTotal(
                received ? line.receivedWeight() : line.agreedWeight(), line.pricePerGram()))
            .reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
    }

    private static UUID actorId(Authentication authentication) {
        return ((AccountPrincipal) authentication.getPrincipal()).id();
    }

    record CreateRequest(UUID requestKey, UUID supplierId, LocalDate operationDate,
                         List<CreateLine> lines, boolean receiveNow, OffsetDateTime effectiveAt) {
        PurchaseService.CreateInput toService() {
            return new PurchaseService.CreateInput(requestKey, supplierId, operationDate,
                lines == null ? null : lines.stream()
                    .map(line -> line == null ? null : line.toService()).toList(),
                receiveNow, effectiveAt);
        }
    }

    record CreateLine(String categoryCode, Integer lengthCm, BigDecimal weight, BigDecimal pricePerGram) {
        PurchaseService.LineInput toService() {
            return new PurchaseService.LineInput(categoryCode, lengthCm, weight, pricePerGram);
        }
    }

    record ReceiptRequest(UUID requestKey, OffsetDateTime effectiveAt, List<ReceiptLine> items) {
        PurchaseService.ReceiptInput toService() {
            return new PurchaseService.ReceiptInput(requestKey, effectiveAt,
                items == null ? null : items.stream()
                    .map(item -> item == null ? null : item.toService()).toList());
        }
    }

    record ReceiptLine(UUID lineId, BigDecimal weight) {
        PurchaseService.ReceiptItemInput toService() {
            return new PurchaseService.ReceiptItemInput(lineId, weight);
        }
    }

    record CorrectionRequest(Long expectedVersion, OffsetDateTime effectiveAt,
                             List<ReceiptLine> items, String reason) {
        PurchaseService.CorrectionInput toService() {
            return new PurchaseService.CorrectionInput(expectedVersion, effectiveAt,
                items == null ? null : items.stream()
                    .map(item -> item == null ? null : item.toService()).toList(), reason);
        }
    }

    record VoidReceiptRequest(Long expectedVersion, String reason) {
        PurchaseService.VoidReceiptInput toService() {
            return new PurchaseService.VoidReceiptInput(expectedVersion, reason);
        }
    }

    record EditRequest(Long expectedVersion, UUID supplierId, LocalDate operationDate,
                       List<EditLine> lines, String reason) {
        PurchaseService.EditInput toService() {
            return new PurchaseService.EditInput(expectedVersion, supplierId, operationDate,
                lines == null ? null : lines.stream()
                    .map(line -> line == null ? null : line.toService()).toList(), reason);
        }
    }

    record EditLine(UUID id, String categoryCode, Integer lengthCm,
                    BigDecimal weight, BigDecimal pricePerGram) {
        PurchaseService.EditLineInput toService() {
            return new PurchaseService.EditLineInput(id, categoryCode, lengthCm, weight, pricePerGram);
        }
    }

    record ReasonRequest(String reason) {}

    record PaymentRequest(UUID requestKey, LocalDate paymentDate, BigDecimal amount,
                          String method, String reference) {
        PurchasePaymentService.CreateInput toService() {
            return new PurchasePaymentService.CreateInput(requestKey, paymentDate, amount,
                method, reference);
        }
    }

    record PaymentCorrectionRequest(Long expectedVersion, LocalDate paymentDate,
                                    BigDecimal amount, String method, String reference,
                                    String reason) {
        PurchasePaymentService.CorrectionInput toService() {
            return new PurchasePaymentService.CorrectionInput(expectedVersion, paymentDate,
                amount, method, reference, reason);
        }
    }

    record PaymentVoidRequest(Long expectedVersion, String reason) {
        PurchasePaymentService.VoidInput toService() {
            return new PurchasePaymentService.VoidInput(expectedVersion, reason);
        }
    }

    record Summary(UUID id, UUID supplierId, String supplierName, LocalDate operationDate,
                   String status, Instant createdAt, Instant confirmedAt, Instant canceledAt,
                   Instant updatedAt, long version, BigDecimal agreedWeight, BigDecimal receivedWeight,
                   BigDecimal agreedTotal, BigDecimal receivedValue, BigDecimal payableTotal,
                   BigDecimal paidTotal, BigDecimal balance) {}

    record Detail(Summary summary, List<LineView> lines,
                  List<ReceiptView> receipts, List<PaymentView> payments,
                  List<HistoryView> history) {}

    record LineView(UUID id, String categoryCode, String categoryName, int lengthCm,
                    BigDecimal agreedWeight, BigDecimal receivedWeight, BigDecimal remainingWeight,
                    BigDecimal pricePerGram, BigDecimal agreedTotal, BigDecimal receivedValue) {
        static LineView from(PurchaseLine line) {
            return new LineView(line.id(), line.categoryCode(), line.categoryName(), line.lengthCm(),
                line.agreedWeight(), line.receivedWeight(),
                line.agreedWeight().subtract(line.receivedWeight()), line.pricePerGram(),
                PurchaseService.lineTotal(line.agreedWeight(), line.pricePerGram()),
                PurchaseService.lineTotal(line.receivedWeight(), line.pricePerGram()));
        }
    }

    record ReceiptView(UUID id, Instant effectiveAt, Instant recordedAt, Instant voidedAt,
                       List<ReceiptItemView> items) {}
    record ReceiptItemView(UUID id, UUID lineId, BigDecimal weight) {
        static ReceiptItemView from(ReceiptItem row) {
            return new ReceiptItemView(row.id(), row.purchaseLineId(), row.weight());
        }
    }

    record PaymentView(UUID id, LocalDate paymentDate, BigDecimal amount, String method,
                       String reference, Instant recordedAt, Instant updatedAt, Instant voidedAt) {
        static PaymentView from(Payment row) {
            return new PaymentView(row.id(), row.paymentDate(), row.amount(), row.method(),
                row.reference(), row.recordedAt(), row.updatedAt(), row.voidedAt());
        }
    }

    record HistoryView(long id, Instant changedAt, String eventType, UUID actorUserId,
                       String reason, JsonNode oldValues, JsonNode newValues) {}
}
