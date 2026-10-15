package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
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
import bo.lamagiadelcabello.backend.SaleService.SaleProblem;

@RestController
@RequestMapping("/api/sales")
class SaleController {

    private final SaleService sales;
    private final SaleRepository repository;
    private final ObjectMapper json;

    SaleController(SaleService sales, SaleRepository repository, ObjectMapper json) {
        this.sales = sales;
        this.repository = repository;
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

    @PostMapping("/{id}/cancel")
    Detail cancel(@PathVariable UUID id, @RequestBody ReasonRequest input,
                  Authentication authentication) {
        return detailOf(sales.cancel(id, input == null ? null : input.reason(),
            actorId(authentication)));
    }

    @PutMapping("/{id}")
    Detail edit(@PathVariable UUID id, @RequestBody EditRequest input,
                Authentication authentication) {
        return detailOf(sales.edit(id, input == null ? null : input.toService(),
            actorId(authentication)));
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
        return new Summary(sale.id(), sale.customerName(), sale.operationDate(),
            sale.acceptedPendingStock(), sale.status(), sale.createdAt(),
            sale.confirmedAt(), sale.canceledAt(), sale.updatedAt(), sale.version(),
            weight, BigDecimal.ZERO.setScale(2), total);
    }

    private Detail detailOf(Sale sale) {
        return new Detail(summary(sale), repository.lines(sale.id()).stream()
            .map(LineView::from).toList(), repository.history(sale.id()).stream()
            .map(this::historyView).toList());
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

    record Summary(UUID id, String customerName, LocalDate operationDate,
                   boolean acceptedPendingStock, String status, Instant createdAt,
                   Instant confirmedAt, Instant canceledAt, Instant updatedAt,
                   long version, BigDecimal agreedWeight, BigDecimal deliveredWeight,
                   BigDecimal agreedTotal) {}

    record Detail(Summary summary, List<LineView> lines, List<HistoryView> history) {}

    record LineView(UUID id, String categoryCode, String categoryName, int lengthCm,
                    BigDecimal agreedWeight, BigDecimal deliveredWeight,
                    BigDecimal remainingWeight, BigDecimal pricePerGram,
                    BigDecimal agreedTotal) {
        static LineView from(SaleLine row) {
            return new LineView(row.id(), row.categoryCode(), row.categoryName(), row.lengthCm(),
                row.agreedWeight(), BigDecimal.ZERO.setScale(2), row.agreedWeight(),
                row.pricePerGram(), PurchaseService.lineTotal(
                    row.agreedWeight(), row.pricePerGram()));
        }
    }

    record HistoryView(long id, Instant changedAt, String eventType, UUID actorUserId,
                       String reason, JsonNode oldValues, JsonNode newValues) {}

    record ErrorView(String code, String error, List<SaleService.AvailabilityIssue> details) {}
}
