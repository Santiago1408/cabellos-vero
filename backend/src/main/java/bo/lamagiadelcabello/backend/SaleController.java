package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
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

import bo.lamagiadelcabello.backend.SaleRepository.History;
import bo.lamagiadelcabello.backend.SaleRepository.Sale;
import bo.lamagiadelcabello.backend.SaleRepository.SaleLine;
import bo.lamagiadelcabello.backend.SaleRepository.Delivery;
import bo.lamagiadelcabello.backend.SaleRepository.DeliveryItem;
import bo.lamagiadelcabello.backend.SaleRepository.Consumption;
import bo.lamagiadelcabello.backend.SalePaymentRepository.Payment;
import bo.lamagiadelcabello.backend.SaleService.SaleProblem;

@RestController
@RequestMapping("/api/sales")
class SaleController {

    private final SaleService sales;
    private final SaleRepository repository;
    private final SalePaymentRepository paymentRepository;
    private final SalePaymentService paymentService;
    private final ObjectMapper json;

    SaleController(SaleService sales, SaleRepository repository,
                   SalePaymentRepository paymentRepository,
                   SalePaymentService paymentService, ObjectMapper json) {
        this.sales = sales;
        this.repository = repository;
        this.paymentRepository = paymentRepository;
        this.paymentService = paymentService;
        this.json = json;
    }

    @GetMapping
    List<Summary> list() {
        return sales.list().stream().map(this::summary).toList();
    }

    @GetMapping("/{id}")
    Detail detail(@PathVariable UUID id) {
        return detailOf(sales.get(id));
    }

    @PostMapping("/reservations")
    ResponseEntity<Detail> reserve(@RequestBody CreateRequest input, Authentication authentication) {
        Sale created = sales.createReservation(input == null ? null : input.toService(),
            actorId(authentication));
        return ResponseEntity.created(URI.create("/api/sales/" + created.id()))
            .body(detailOf(created));
    }

    @PostMapping
    ResponseEntity<Detail> immediate(@RequestBody ImmediateRequest input,
                                     Authentication authentication) {
        Sale created = sales.createImmediate(input == null ? null : input.toService(),
            actorId(authentication));
        return ResponseEntity.created(URI.create("/api/sales/" + created.id()))
            .body(detailOf(created));
    }

    @PostMapping("/{id}/cancel")
    Detail cancel(@PathVariable UUID id, @RequestBody ReasonRequest input,
                  Authentication authentication) {
        return detailOf(sales.cancel(id, input == null ? null : input.reason(),
            actorId(authentication)));
    }

    @PostMapping("/{id}/deliveries")
    Detail deliver(@PathVariable UUID id, @RequestBody DeliveryRequest input,
                   Authentication authentication) {
        return detailOf(sales.deliver(id, input == null ? null : input.toService(),
            actorId(authentication)));
    }

    @PutMapping("/{id}/deliveries/{deliveryId}")
    Detail correctDelivery(@PathVariable UUID id, @PathVariable UUID deliveryId,
                           @RequestBody DeliveryCorrectionRequest input,
                           Authentication authentication) {
        return detailOf(sales.correctDelivery(id, deliveryId,
            input == null ? null : input.toService(), actorId(authentication)));
    }

    @PostMapping("/{id}/deliveries/{deliveryId}/void")
    Detail voidDelivery(@PathVariable UUID id, @PathVariable UUID deliveryId,
                        @RequestBody DeliveryVoidRequest input,
                        Authentication authentication) {
        return detailOf(sales.voidDelivery(id, deliveryId,
            input == null ? null : input.toService(), actorId(authentication)));
    }

    @PutMapping("/{id}")
    Detail edit(@PathVariable UUID id, @RequestBody EditRequest input,
                Authentication authentication) {
        return detailOf(sales.edit(id, input == null ? null : input.toService(),
            actorId(authentication)));
    }

    @PostMapping("/{id}/payments")
    Detail recordPayment(@PathVariable UUID id, @RequestBody PaymentRequest input,
                         Authentication authentication) {
        return detailOf(paymentService.create(id,
            input == null ? null : input.toService(), actorId(authentication)));
    }

    @PutMapping("/{id}/payments/{paymentId}")
    Detail correctPayment(@PathVariable UUID id, @PathVariable UUID paymentId,
                          @RequestBody PaymentCorrectionRequest input,
                          Authentication authentication) {
        return detailOf(paymentService.correct(id, paymentId,
            input == null ? null : input.toService(), actorId(authentication)));
    }

    @PostMapping("/{id}/payments/{paymentId}/void")
    Detail voidPayment(@PathVariable UUID id, @PathVariable UUID paymentId,
                       @RequestBody PaymentVoidRequest input,
                       Authentication authentication) {
        return detailOf(paymentService.voidPayment(id, paymentId,
            input == null ? null : input.toService(), actorId(authentication)));
    }

    @ExceptionHandler(SaleProblem.class)
    ResponseEntity<ErrorView> saleProblem(SaleProblem error) {
        return ResponseEntity.status(error.status())
            .body(new ErrorView(error.code(), error.getMessage(), error.issues()));
    }

    private Summary summary(Sale sale) {
        List<SaleLine> lines = repository.lines(sale.id());
        BigDecimal weight = lines.stream().map(SaleLine::agreedWeight)
            .reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
        BigDecimal total = lines.stream().map(line -> PurchaseService.lineTotal(
                line.agreedWeight(), line.pricePerGram()))
            .reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
        BigDecimal delivered = lines.stream().map(SaleLine::deliveredWeight)
            .reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
        BigDecimal deliveredValue = lines.stream().map(line -> PurchaseService.lineTotal(
                line.deliveredWeight(), line.pricePerGram()))
            .reduce(BigDecimal.ZERO.setScale(2), BigDecimal::add);
        BigDecimal payable = sale.status().equals("CANCELED") ? deliveredValue : total;
        BigDecimal paid = paymentRepository.totalActive(sale.id());
        return new Summary(sale.id(), sale.customerName(), sale.operationDate(),
            sale.acceptedPendingStock(), sale.status(), sale.createdAt(),
            sale.confirmedAt(), sale.canceledAt(), sale.updatedAt(), sale.version(),
            weight, delivered, total, deliveredValue, payable, paid,
            payable.subtract(paid));
    }

    private Detail detailOf(Sale sale) {
        return new Detail(summary(sale), repository.lines(sale.id()).stream()
            .map(LineView::from).toList(), repository.deliveries(sale.id()).stream()
            .map(this::deliveryView).toList(), paymentRepository.list(sale.id()).stream()
            .map(PaymentView::from).toList(), repository.history(sale.id()).stream()
            .map(this::historyView).toList());
    }

    private DeliveryView deliveryView(Delivery row) {
        return new DeliveryView(row.id(), row.effectiveAt(), row.recordedAt(), row.voidedAt(),
            repository.deliveryItems(row.id()).stream().map(this::deliveryItemView).toList());
    }

    private DeliveryItemView deliveryItemView(DeliveryItem row) {
        return new DeliveryItemView(row.id(), row.saleLineId(), row.weight(),
            repository.consumptions(row.id()).stream().map(ConsumptionView::from).toList());
    }

    private HistoryView historyView(History row) {
        return new HistoryView(row.id(), row.changedAt(), row.eventType(), row.actorUserId(),
            row.reason(), row.oldValuesJson() == null ? null : json.readTree(row.oldValuesJson()),
            row.newValuesJson() == null ? null : json.readTree(row.newValuesJson()));
    }

    private static UUID actorId(Authentication authentication) {
        return ((AccountPrincipal) authentication.getPrincipal()).id();
    }

    record CreateRequest(UUID requestKey, String customerName, LocalDate operationDate,
                         List<CreateLine> lines, boolean acceptPendingStock) {
        SaleService.CreateInput toService() {
            return new SaleService.CreateInput(requestKey, customerName, operationDate,
                lines == null ? null : lines.stream()
                    .map(line -> line == null ? null : line.toService()).toList(),
                acceptPendingStock);
        }
    }

    record CreateLine(String categoryCode, Integer lengthCm, BigDecimal weight,
                      BigDecimal pricePerGram) {
        SaleService.LineInput toService() {
            return new SaleService.LineInput(categoryCode, lengthCm, weight, pricePerGram);
        }
    }

    record ImmediateRequest(UUID requestKey, String customerName, LocalDate operationDate,
                            List<CreateLine> lines, OffsetDateTime effectiveAt) {
        SaleService.ImmediateInput toService() {
            return new SaleService.ImmediateInput(requestKey, customerName, operationDate,
                lines == null ? null : lines.stream()
                    .map(line -> line == null ? null : line.toService()).toList(), effectiveAt);
        }
    }

    record EditRequest(Long expectedVersion, String customerName, LocalDate operationDate,
                       List<EditLine> lines, boolean acceptPendingStock, String reason) {
        SaleService.EditInput toService() {
            return new SaleService.EditInput(expectedVersion, customerName, operationDate,
                lines == null ? null : lines.stream()
                    .map(line -> line == null ? null : line.toService()).toList(),
                acceptPendingStock, reason);
        }
    }

    record EditLine(UUID id, String categoryCode, Integer lengthCm,
                    BigDecimal weight, BigDecimal pricePerGram) {
        SaleService.EditLineInput toService() {
            return new SaleService.EditLineInput(id, categoryCode, lengthCm, weight, pricePerGram);
        }
    }

    record ReasonRequest(String reason) {}

    record DeliveryRequest(UUID requestKey, OffsetDateTime effectiveAt,
                           List<DeliveryItemRequest> items) {
        SaleService.DeliveryInput toService() {
            return new SaleService.DeliveryInput(requestKey, effectiveAt,
                items == null ? null : items.stream()
                    .map(item -> item == null ? null : item.toService()).toList());
        }
    }

    record DeliveryItemRequest(UUID lineId, BigDecimal weight) {
        SaleService.DeliveryItemInput toService() {
            return new SaleService.DeliveryItemInput(lineId, weight);
        }
    }

    record DeliveryCorrectionRequest(Long expectedVersion, OffsetDateTime effectiveAt,
                                     List<DeliveryItemRequest> items, String reason) {
        SaleService.CorrectionInput toService() {
            return new SaleService.CorrectionInput(expectedVersion, effectiveAt,
                items == null ? null : items.stream()
                    .map(item -> item == null ? null : item.toService()).toList(), reason);
        }
    }

    record DeliveryVoidRequest(Long expectedVersion, String reason) {
        SaleService.VoidDeliveryInput toService() {
            return new SaleService.VoidDeliveryInput(expectedVersion, reason);
        }
    }

    record PaymentRequest(UUID requestKey, LocalDate paymentDate, BigDecimal amount,
                          String method, String reference) {
        SalePaymentService.CreateInput toService() {
            return new SalePaymentService.CreateInput(requestKey, paymentDate, amount,
                method, reference);
        }
    }

    record PaymentCorrectionRequest(Long expectedVersion, LocalDate paymentDate,
                                    BigDecimal amount, String method, String reference,
                                    String reason) {
        SalePaymentService.CorrectionInput toService() {
            return new SalePaymentService.CorrectionInput(expectedVersion, paymentDate,
                amount, method, reference, reason);
        }
    }

    record PaymentVoidRequest(Long expectedVersion, String reason) {
        SalePaymentService.VoidInput toService() {
            return new SalePaymentService.VoidInput(expectedVersion, reason);
        }
    }

    record Summary(UUID id, String customerName, LocalDate operationDate,
                   boolean acceptedPendingStock, String status, Instant createdAt,
                   Instant confirmedAt, Instant canceledAt, Instant updatedAt,
                   long version, BigDecimal agreedWeight, BigDecimal deliveredWeight,
                   BigDecimal agreedTotal, BigDecimal deliveredValue,
                   BigDecimal payableTotal, BigDecimal paidTotal, BigDecimal balance) {}

    record Detail(Summary summary, List<LineView> lines,
                  List<DeliveryView> deliveries, List<PaymentView> payments,
                  List<HistoryView> history) {}

    record LineView(UUID id, String categoryCode, String categoryName, int lengthCm,
                    BigDecimal agreedWeight, BigDecimal deliveredWeight,
                    BigDecimal remainingWeight, BigDecimal pricePerGram,
                    BigDecimal agreedTotal, BigDecimal deliveredValue) {
        static LineView from(SaleLine row) {
            return new LineView(row.id(), row.categoryCode(), row.categoryName(), row.lengthCm(),
                row.agreedWeight(), row.deliveredWeight(),
                row.agreedWeight().subtract(row.deliveredWeight()),
                row.pricePerGram(), PurchaseService.lineTotal(
                    row.agreedWeight(), row.pricePerGram()),
                PurchaseService.lineTotal(row.deliveredWeight(), row.pricePerGram()));
        }
    }

    record DeliveryView(UUID id, Instant effectiveAt, Instant recordedAt, Instant voidedAt,
                        List<DeliveryItemView> items) {}
    record DeliveryItemView(UUID id, UUID lineId, BigDecimal weight,
                            List<ConsumptionView> consumedLots) {}
    record PaymentView(UUID id, LocalDate paymentDate, BigDecimal amount, String method,
                       String reference, Instant recordedAt, Instant updatedAt, Instant voidedAt) {
        static PaymentView from(Payment row) {
            return new PaymentView(row.id(), row.paymentDate(), row.amount(), row.method(),
                row.reference(), row.recordedAt(), row.updatedAt(), row.voidedAt());
        }
    }
    record ConsumptionView(UUID stockLotId, BigDecimal weight, BigDecimal costPerGram,
                           Instant receivedAt, UUID purchaseId, String supplierName) {
        static ConsumptionView from(Consumption row) {
            return new ConsumptionView(row.stockLotId(), row.weight(), row.costPerGram(),
                row.receivedAt(), row.purchaseId(), row.supplierName());
        }
    }

    record HistoryView(long id, Instant changedAt, String eventType, UUID actorUserId,
                       String reason, JsonNode oldValues, JsonNode newValues) {}

    record ErrorView(String code, String error, List<SaleService.AvailabilityIssue> details) {}
}
