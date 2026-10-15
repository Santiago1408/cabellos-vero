package bo.lamagiadelcabello.backend;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
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

import bo.lamagiadelcabello.backend.SupplierRepository.History;
import bo.lamagiadelcabello.backend.SupplierRepository.Supplier;
import bo.lamagiadelcabello.backend.SupplierRepository.SupplierData;
import bo.lamagiadelcabello.backend.SupplierService.SupplierProblem;

@RestController
@RequestMapping("/api/suppliers")
class SupplierController {

    private final SupplierService suppliers;
    private final ObjectMapper json;

    SupplierController(SupplierService suppliers, ObjectMapper json) {
        this.suppliers = suppliers;
        this.json = json;
    }

    @GetMapping
    List<SupplierView> list() {
        return suppliers.list().stream().map(SupplierView::from).toList();
    }

    @GetMapping("/{id}")
    SupplierView detail(@PathVariable UUID id) {
        return SupplierView.from(suppliers.get(id));
    }

    @GetMapping("/{id}/history")
    List<HistoryView> history(@PathVariable UUID id) {
        return suppliers.history(id).stream().map(this::historyView).toList();
    }

    @PostMapping
    ResponseEntity<SupplierView> create(@RequestBody SupplierInput input, Authentication authentication) {
        Supplier created = suppliers.create(input == null ? null : input.data(), actorId(authentication));
        return ResponseEntity.created(URI.create("/api/suppliers/" + created.id()))
            .body(SupplierView.from(created));
    }

    @PutMapping("/{id}")
    SupplierView edit(@PathVariable UUID id, @RequestBody SupplierEditInput input,
                      Authentication authentication) {
        return SupplierView.from(suppliers.edit(id, input == null ? null : input.data(),
            input == null ? null : input.reason(), actorId(authentication)));
    }

    @DeleteMapping("/{id}")
    ResponseEntity<Void> delete(@PathVariable UUID id, @RequestBody ReasonInput input,
                                Authentication authentication) {
        suppliers.delete(id, input == null ? null : input.reason(), actorId(authentication));
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(SupplierProblem.class)
    ResponseEntity<Map<String, String>> supplierProblem(SupplierProblem error) {
        return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
    }

    private HistoryView historyView(History row) {
        return new HistoryView(row.id(), row.changedAt(), row.eventType(), row.actorUserId(),
            row.reason(), parse(row.oldValuesJson()), parse(row.newValuesJson()));
    }

    private JsonNode parse(String value) { return value == null ? null : json.readTree(value); }

    private static UUID actorId(Authentication authentication) {
        return ((AccountPrincipal) authentication.getPrincipal()).id();
    }

    record SupplierInput(String name, String phone, String city, String address, String mapsUrl) {
        SupplierData data() { return new SupplierData(name, phone, city, address, mapsUrl); }
    }

    record SupplierEditInput(String name, String phone, String city, String address,
                             String mapsUrl, String reason) {
        SupplierData data() { return new SupplierData(name, phone, city, address, mapsUrl); }
    }

    record ReasonInput(String reason) {}

    record SupplierView(UUID id, String name, String phone, String city, String address,
                        String mapsUrl, Instant createdAt, Instant modifiedAt) {
        static SupplierView from(Supplier supplier) {
            return new SupplierView(supplier.id(), supplier.name(), supplier.phone(),
                supplier.city(), supplier.address(), supplier.mapsUrl(),
                supplier.createdAt(), supplier.modifiedAt());
        }
    }

    record HistoryView(long id, Instant changedAt, String eventType, UUID actorUserId,
                       String reason, JsonNode oldValues, JsonNode newValues) {}
}
