package bo.lamagiadelcabello.backend;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/inventory")
class InventoryController {

    private final InventoryService inventory;

    InventoryController(InventoryService inventory) {
        this.inventory = inventory;
    }

    @GetMapping
    List<InventoryService.StockRow> list() {
        return inventory.list();
    }

    @GetMapping("/pending-purchases")
    List<InventoryService.PendingPurchaseView> pendingPurchases() {
        return inventory.pendingPurchases();
    }

    @GetMapping("/reserved-sales")
    List<InventoryService.ReservedSaleView> reservedSales() {
        return inventory.reservedSales();
    }

    @GetMapping("/{categoryCode}/{lengthCm}")
    InventoryService.StockDetail detail(@PathVariable String categoryCode,
                                        @PathVariable int lengthCm) {
        return inventory.detail(categoryCode, lengthCm);
    }
}
