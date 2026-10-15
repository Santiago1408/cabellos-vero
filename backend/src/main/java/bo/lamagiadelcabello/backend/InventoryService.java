package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import bo.lamagiadelcabello.backend.InventoryRepository.InventoryType;
import bo.lamagiadelcabello.backend.InventoryRepository.Movement;
import bo.lamagiadelcabello.backend.InventoryRepository.PendingPurchase;
import bo.lamagiadelcabello.backend.InventoryRepository.ReservedSale;

@Service
class InventoryService {

    private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(2);

    private final InventoryRepository repository;
    private final SaleInventoryRepository positions;

    InventoryService(InventoryRepository repository, SaleInventoryRepository positions) {
        this.repository = repository;
        this.positions = positions;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<StockRow> list() {
        return repository.typesWithPurchases().stream().map(this::stockRow).toList();
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public StockDetail detail(String categoryCode, int lengthCm) {
        InventoryType type = repository.typesWithPurchases().stream()
            .filter(row -> row.categoryCode().equals(categoryCode) && row.lengthCm() == lengthCm)
            .findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "No hay compras registradas de esta categoría y longitud."));
        StockRow stock = stockRow(type);
        BigDecimal running = ZERO;
        List<MovementView> movements = new ArrayList<>();
        for (Movement movement : repository.movements(type.hairType())) {
            BigDecimal signed = movement.kind().equals("PURCHASE")
                ? movement.weight() : movement.weight().negate();
            running = running.add(signed);
            movements.add(new MovementView(movement.movementId(), movement.kind(),
                movement.effectiveAt(), movement.recordedAt(), movement.operationId(),
                movement.partyName(), movement.weight(), signed,
                movement.pricePerGram(), movement.movementValue(),
                movement.stockLotId(), movement.lotRemaining(), running));
        }
        if (running.compareTo(stock.physicalStock()) != 0) {
            throw new IllegalStateException("Los movimientos no coinciden con el stock físico.");
        }
        return new StockDetail(stock, movements);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<PendingPurchaseView> pendingPurchases() {
        return repository.pendingPurchases().stream().map(row ->
            new PendingPurchaseView(row.operationId(), row.operationDate(), row.createdAt(),
                row.supplierId(), row.supplierName(), row.lineId(), row.categoryCode(),
                row.categoryName(), row.lengthCm(), row.agreedWeight(), row.receivedWeight(),
                row.remainingWeight(), row.pricePerGram(),
                PurchaseService.lineTotal(row.agreedWeight(), row.pricePerGram())
                    .subtract(PurchaseService.lineTotal(
                        row.receivedWeight(), row.pricePerGram())))
        ).toList();
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public List<ReservedSaleView> reservedSales() {
        return repository.reservedSales().stream().map(row ->
            new ReservedSaleView(row.operationId(), row.operationDate(), row.createdAt(),
                row.customerName(), row.lineId(), row.categoryCode(), row.categoryName(),
                row.lengthCm(), row.agreedWeight(), row.deliveredWeight(),
                row.remainingWeight(), row.pricePerGram(),
                PurchaseService.lineTotal(row.agreedWeight(), row.pricePerGram())
                    .subtract(PurchaseService.lineTotal(
                        row.deliveredWeight(), row.pricePerGram())))
        ).toList();
    }

    private StockRow stockRow(InventoryType type) {
        var position = positions.position(type.hairType());
        BigDecimal physicalReserved = position.reserved().min(position.physical());
        BigDecimal pendingReserved = position.reserved().subtract(physicalReserved);
        return new StockRow(type.categoryCode(), type.categoryName(), type.lengthCm(),
            position.physical(), position.pending(), position.reserved(),
            physicalReserved, pendingReserved,
            position.physical().subtract(physicalReserved).max(ZERO),
            position.pending().subtract(pendingReserved).max(ZERO));
    }

    record StockRow(String categoryCode, String categoryName, int lengthCm,
                    BigDecimal physicalStock, BigDecimal pendingPurchase,
                    BigDecimal reservedSale, BigDecimal reservedFromPhysical,
                    BigDecimal reservedFromPending, BigDecimal freePhysical,
                    BigDecimal freePending) {}

    record StockDetail(StockRow stock, List<MovementView> movements) {}

    record MovementView(UUID id, String kind, Instant effectiveAt, Instant recordedAt,
                        UUID operationId, String partyName, BigDecimal weight,
                        BigDecimal signedWeight, BigDecimal pricePerGram,
                        BigDecimal total, UUID stockLotId, BigDecimal lotRemaining,
                        BigDecimal runningPhysicalStock) {}

    record PendingPurchaseView(UUID purchaseId, LocalDate operationDate, Instant createdAt,
                               UUID supplierId, String supplierName, UUID lineId,
                               String categoryCode, String categoryName, int lengthCm,
                               BigDecimal agreedWeight, BigDecimal receivedWeight,
                               BigDecimal remainingWeight, BigDecimal pricePerGram,
                               BigDecimal remainingValue) {}

    record ReservedSaleView(UUID saleId, LocalDate operationDate, Instant createdAt,
                            String customerName, UUID lineId, String categoryCode,
                            String categoryName, int lengthCm, BigDecimal agreedWeight,
                            BigDecimal deliveredWeight, BigDecimal remainingWeight,
                            BigDecimal pricePerGram, BigDecimal remainingValue) {}
}
