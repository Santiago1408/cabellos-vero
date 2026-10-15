package bo.lamagiadelcabello.backend;

import java.util.List;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
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

@RestController
@RequestMapping("/api/inventory")
class InventoryController {

    private final InventoryService inventory;
    private final InventoryOpeningService opening;

    InventoryController(InventoryService inventory, InventoryOpeningService opening) {
        this.inventory = inventory;
        this.opening = opening;
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

    @GetMapping("/opening")
    InventoryOpeningService.OpeningView opening() {
        return opening.get();
    }

    @PostMapping("/opening/preview")
    InventoryOpeningService.Preview previewOpening(
        @RequestBody InventoryOpeningService.CreateInput input) {
        return opening.preview(input);
    }

    @PostMapping("/opening")
    InventoryOpeningService.OpeningView createOpening(
        @RequestBody InventoryOpeningService.CreateInput input,
        Authentication authentication) {
        return opening.create(input, ((AccountPrincipal) authentication.getPrincipal()).id());
    }

    @PutMapping("/opening")
    InventoryOpeningService.OpeningView correctOpening(
        @RequestBody InventoryOpeningService.CorrectionInput input,
        Authentication authentication) {
        return opening.correct(input, ((AccountPrincipal) authentication.getPrincipal()).id());
    }

    @ExceptionHandler(InventoryOpeningService.OpeningProblem.class)
    ResponseEntity<java.util.Map<String, String>> openingProblem(
        InventoryOpeningService.OpeningProblem error) {
        return ResponseEntity.status(error.status()).body(java.util.Map.of("error", error.getMessage()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<java.util.Map<String, String>> openingConflict() {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(java.util.Map.of("error",
            "La apertura entró en conflicto con otro cambio. Recarga los datos e inténtalo nuevamente."));
    }

    @GetMapping("/{categoryCode}/{lengthCm}")
    InventoryService.StockDetail detail(@PathVariable String categoryCode,
                                        @PathVariable int lengthCm) {
        return inventory.detail(categoryCode, lengthCm);
    }
}
