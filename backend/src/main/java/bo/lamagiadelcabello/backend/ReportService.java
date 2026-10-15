package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import bo.lamagiadelcabello.backend.ReportRepository.DeliveredHair;
import bo.lamagiadelcabello.backend.ReportRepository.ReceivedHair;

@Service
class ReportService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/La_Paz");
    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2);

    private final ReportRepository reports;

    ReportService(ReportRepository reports) {
        this.reports = reports;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Overview overview() {
        List<ReceivedHair> receipts = reports.receipts();
        List<DeliveredHair> deliveries = checkedDeliveries();
        BigDecimal purchases = receipts.stream()
            .map(ReceivedHair::purchaseValue)
            .reduce(ZERO, BigDecimal::add);
        BigDecimal revenue = deliveries.stream().map(ReportService::revenue)
            .reduce(ZERO, BigDecimal::add);
        BigDecimal costs = deliveries.stream().map(DeliveredHair::cost)
            .reduce(ZERO, BigDecimal::add);
        long salesWithDeliveries = deliveries.stream().map(DeliveredHair::saleId)
            .distinct().count();
        return new Overview(purchases, revenue, costs, revenue.subtract(costs),
            reports.stockValue(), salesWithDeliveries);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PeriodReport results(String rawPeriod, LocalDate rawAsOf, Integer rawCount) {
        Period period = Period.parse(rawPeriod);
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        LocalDate asOf = rawAsOf == null ? today : rawAsOf;
        if (asOf.isAfter(today)) {
            throw badRequest("La fecha de corte no puede estar en el futuro.");
        }
        int count = rawCount == null ? period.defaultCount : rawCount;
        if (count < 1 || count > period.maximumCount) {
            throw badRequest("El número de periodos debe estar entre 1 y "
                + period.maximumCount + ".");
        }
        LocalDate currentStart = period.startOf(asOf);
        List<PeriodBounds> bounds = new ArrayList<>();
        for (int index = count - 1; index >= 0; index--) {
            LocalDate start = period.back(currentStart, index);
            bounds.add(new PeriodBounds(start, period.forward(start)));
        }
        List<PeriodRow> rows = new ArrayList<>();
        List<ReceivedHair> receipts = reports.receipts();
        List<DeliveredHair> deliveries = checkedDeliveries();
        for (PeriodBounds bound : bounds) {
            BigDecimal purchases = ZERO;
            BigDecimal sales = ZERO;
            BigDecimal costs = ZERO;
            for (ReceivedHair receipt : receipts) {
                if (within(receipt.effectiveAt(), bound)) {
                    purchases = purchases.add(receipt.purchaseValue());
                }
            }
            for (DeliveredHair delivery : deliveries) {
                if (within(delivery.effectiveAt(), bound)) {
                    sales = sales.add(revenue(delivery));
                    costs = costs.add(delivery.cost());
                }
            }
            rows.add(new PeriodRow(bound.start(), bound.endExclusive(),
                purchases, sales, costs, sales.subtract(costs)));
        }
        return new PeriodReport(period.name().toLowerCase(java.util.Locale.ROOT), asOf, rows);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<TopProduct> topProducts(Integer rawLimit) {
        int limit = limit(rawLimit);
        Map<ProductKey, ProductTotals> totals = new HashMap<>();
        for (DeliveredHair delivery : checkedDeliveries()) {
            ProductKey key = new ProductKey(delivery.categoryCode(), delivery.lengthCm());
            ProductTotals total = totals.computeIfAbsent(key,
                ignored -> new ProductTotals(delivery.categoryName()));
            total.weight = total.weight.add(delivery.weight());
            total.revenue = total.revenue.add(revenue(delivery));
            total.cost = total.cost.add(delivery.cost());
        }
        Map<ProductKey, BigDecimal> stock = new HashMap<>();
        reports.physicalStocks().forEach(row ->
            stock.put(new ProductKey(row.categoryCode(), row.lengthCm()), row.weight()));
        return totals.entrySet().stream().map(entry -> {
            ProductTotals total = entry.getValue();
            return new TopProduct(entry.getKey().categoryCode(), total.categoryName,
                entry.getKey().lengthCm(), total.weight, total.revenue, total.cost,
                total.revenue.subtract(total.cost),
                stock.getOrDefault(entry.getKey(), ZERO));
        }).sorted(Comparator.comparing(TopProduct::soldWeight).reversed()
            .thenComparing(TopProduct::categoryCode)
            .thenComparingInt(TopProduct::lengthCm)).limit(limit).toList();
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<TopCategory> topCategories(Integer rawLimit) {
        int limit = limit(rawLimit);
        Map<String, CategoryTotals> totals = new HashMap<>();
        BigDecimal allSold = ZERO;
        for (DeliveredHair delivery : checkedDeliveries()) {
            CategoryTotals total = totals.computeIfAbsent(delivery.categoryCode(),
                ignored -> new CategoryTotals(delivery.categoryName()));
            total.weight = total.weight.add(delivery.weight());
            total.revenue = total.revenue.add(revenue(delivery));
            allSold = allSold.add(delivery.weight());
        }
        final BigDecimal denominator = allSold;
        return totals.entrySet().stream().map(entry -> {
            CategoryTotals total = entry.getValue();
            int share = denominator.signum() == 0 ? 0 : total.weight
                .multiply(BigDecimal.valueOf(100))
                .divide(denominator, 0, RoundingMode.HALF_UP).intValueExact();
            return new TopCategory(entry.getKey(), total.categoryName, total.weight,
                total.revenue, share);
        }).sorted(Comparator.comparing(TopCategory::soldWeight).reversed()
            .thenComparing(TopCategory::categoryCode)).limit(limit).toList();
    }

    private List<DeliveredHair> checkedDeliveries() {
        List<DeliveredHair> deliveries = reports.deliveries();
        for (DeliveredHair delivery : deliveries) {
            if (delivery.weight().compareTo(delivery.allocatedWeight()) != 0) {
                throw new IllegalStateException(
                    "Una entrega no tiene asignado todo su costo de inventario: " + delivery.id());
            }
        }
        return deliveries;
    }

    private static BigDecimal revenue(DeliveredHair delivery) {
        return delivery.revenueValue();
    }

    private static boolean within(Instant effectiveAt, PeriodBounds bounds) {
        LocalDate date = LocalDate.ofInstant(effectiveAt, BUSINESS_ZONE);
        return !date.isBefore(bounds.start()) && date.isBefore(bounds.endExclusive());
    }

    private static int limit(Integer rawLimit) {
        int limit = rawLimit == null ? 5 : rawLimit;
        if (limit < 1 || limit > 20) {
            throw badRequest("El límite debe estar entre 1 y 20.");
        }
        return limit;
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private enum Period {
        DAYS(30, 366), WEEKS(12, 104), MONTHS(6, 36);

        private final int defaultCount;
        private final int maximumCount;

        Period(int defaultCount, int maximumCount) {
            this.defaultCount = defaultCount;
            this.maximumCount = maximumCount;
        }

        static Period parse(String value) {
            if (value == null || value.isBlank()) return MONTHS;
            return switch (value.trim().toLowerCase(java.util.Locale.ROOT)) {
                case "days" -> DAYS;
                case "weeks" -> WEEKS;
                case "months" -> MONTHS;
                default -> throw badRequest("El periodo debe ser days, weeks o months.");
            };
        }

        LocalDate startOf(LocalDate date) {
            return switch (this) {
                case DAYS -> date;
                case WEEKS -> date.with(DayOfWeek.MONDAY);
                case MONTHS -> date.withDayOfMonth(1);
            };
        }

        LocalDate back(LocalDate start, int count) {
            return switch (this) {
                case DAYS -> start.minusDays(count);
                case WEEKS -> start.minusWeeks(count);
                case MONTHS -> start.minusMonths(count);
            };
        }

        LocalDate forward(LocalDate start) {
            return switch (this) {
                case DAYS -> start.plusDays(1);
                case WEEKS -> start.plusWeeks(1);
                case MONTHS -> start.plusMonths(1);
            };
        }
    }

    private static final class ProductTotals {
        private final String categoryName;
        private BigDecimal weight = ZERO;
        private BigDecimal revenue = ZERO;
        private BigDecimal cost = ZERO;

        private ProductTotals(String categoryName) { this.categoryName = categoryName; }
    }

    private static final class CategoryTotals {
        private final String categoryName;
        private BigDecimal weight = ZERO;
        private BigDecimal revenue = ZERO;

        private CategoryTotals(String categoryName) { this.categoryName = categoryName; }
    }

    private record ProductKey(String categoryCode, int lengthCm) {}
    private record PeriodBounds(LocalDate start, LocalDate endExclusive) {}

    record Overview(BigDecimal receivedPurchases, BigDecimal salesRevenue,
                    BigDecimal hairCost, BigDecimal grossMargin,
                    BigDecimal stockCostValue, long salesWithDeliveries) {}

    record PeriodReport(String period, LocalDate asOf, List<PeriodRow> rows) {}
    record PeriodRow(LocalDate start, LocalDate endExclusive,
                     BigDecimal purchases, BigDecimal sales, BigDecimal costs,
                     BigDecimal grossMargin) {}

    record TopProduct(String categoryCode, String categoryName, int lengthCm,
                      BigDecimal soldWeight, BigDecimal salesRevenue,
                      BigDecimal hairCost, BigDecimal grossMargin,
                      BigDecimal physicalStock) {}

    record TopCategory(String categoryCode, String categoryName,
                       BigDecimal soldWeight, BigDecimal salesRevenue,
                       int sharePercent) {}
}
