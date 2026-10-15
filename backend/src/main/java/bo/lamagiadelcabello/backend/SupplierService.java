package bo.lamagiadelcabello.backend;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;

import bo.lamagiadelcabello.backend.SupplierRepository.History;
import bo.lamagiadelcabello.backend.SupplierRepository.Supplier;
import bo.lamagiadelcabello.backend.SupplierRepository.SupplierData;

@Service
class SupplierService {

    private static final Pattern GOOGLE_HOST = Pattern.compile(
        "^(www\\.)?google\\.(com|[a-z]{2}|com\\.[a-z]{2}|co\\.[a-z]{2})$"
    );

    private final SupplierRepository suppliers;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;

    SupplierService(SupplierRepository suppliers, TransactionTemplate transactions, ObjectMapper json) {
        this.suppliers = suppliers;
        this.transactions = transactions;
        this.json = json;
    }

    List<Supplier> list() { return suppliers.findAll(); }

    Supplier get(UUID id) {
        return suppliers.findById(id)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Proveedor no encontrado."));
    }

    List<History> history(UUID id) {
        List<History> rows = suppliers.history(id);
        if (rows.isEmpty()) throw problem(HttpStatus.NOT_FOUND, "Historial de proveedor no encontrado.");
        return rows;
    }

    Supplier create(SupplierData raw, UUID actorId) {
        SupplierData data = validate(raw);
        UUID id = UUID.randomUUID();
        try {
            return transactions.execute(status -> {
                ensureUnique(data.name(), null);
                suppliers.create(id, data);
                Supplier created = get(id);
                suppliers.addHistory(id, "SUPPLIER_CREATED", actorId, null, null, snapshotJson(created));
                return created;
            });
        } catch (DataIntegrityViolationException conflict) {
            throw problem(HttpStatus.CONFLICT, "Ya existe un proveedor con ese nombre.");
        }
    }

    Supplier edit(UUID id, SupplierData raw, String rawReason, UUID actorId) {
        SupplierData data = validate(raw);
        String reason = validateReason(rawReason);
        try {
            return transactions.execute(status -> {
                Supplier before = locked(id);
                ensureUnique(data.name(), id);
                if (sameDetails(before, data)) {
                    throw problem(HttpStatus.BAD_REQUEST, "No hay cambios en los datos del proveedor.");
                }
                suppliers.update(id, data);
                Supplier after = get(id);
                suppliers.addHistory(id, "SUPPLIER_UPDATED", actorId, reason,
                    snapshotJson(before), snapshotJson(after));
                return after;
            });
        } catch (DataIntegrityViolationException conflict) {
            throw problem(HttpStatus.CONFLICT, "Ya existe un proveedor con ese nombre.");
        }
    }

    void delete(UUID id, String rawReason, UUID actorId) {
        String reason = validateReason(rawReason);
        try {
            transactions.executeWithoutResult(status -> {
                Supplier before = locked(id);
                suppliers.delete(id);
                suppliers.addHistory(id, "SUPPLIER_DELETED", actorId, reason,
                    snapshotJson(before), null);
            });
        } catch (DataIntegrityViolationException inUse) {
            throw problem(HttpStatus.CONFLICT,
                "No se puede eliminar el proveedor porque aparece en registros del negocio.");
        }
    }

    private Supplier locked(UUID id) {
        return suppliers.findByIdForUpdate(id)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Proveedor no encontrado."));
    }

    private void ensureUnique(String name, UUID exceptId) {
        if (suppliers.nameExists(name, exceptId)) {
            throw problem(HttpStatus.CONFLICT, "Ya existe un proveedor con ese nombre.");
        }
    }

    private static SupplierData validate(SupplierData raw) {
        if (raw == null) throw problem(HttpStatus.BAD_REQUEST, "Faltan los datos del proveedor.");
        String name = trimmed(raw.name()).replaceAll("\\s+", " ");
        String phone = trimmed(raw.phone());
        String city = trimmed(raw.city());
        String address = trimmed(raw.address());
        String mapsUrl = trimmed(raw.mapsUrl());
        if (name.isEmpty() || name.length() > 160) {
            throw problem(HttpStatus.BAD_REQUEST, "El nombre es obligatorio y admite hasta 160 caracteres.");
        }
        if (phone.isEmpty() || phone.length() > 40) {
            throw problem(HttpStatus.BAD_REQUEST, "El teléfono es obligatorio y admite hasta 40 caracteres.");
        }
        if (city.length() > 100 || address.length() > 250 || mapsUrl.length() > 1000) {
            throw problem(HttpStatus.BAD_REQUEST, "Ciudad, dirección o enlace superan el tamaño permitido.");
        }
        if (!mapsUrl.isEmpty() && !validMapsUrl(mapsUrl)) {
            throw problem(HttpStatus.BAD_REQUEST, "Ingresa un enlace HTTPS válido de Google Maps.");
        }
        return new SupplierData(name, phone, city, address, mapsUrl);
    }

    private static boolean validMapsUrl(String value) {
        try {
            URI uri = URI.create(value);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null
                || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) return false;
            host = host.toLowerCase(Locale.ROOT);
            String path = uri.getPath() == null ? "" : uri.getPath();
            return host.equals("maps.app.goo.gl") || host.equals("maps.google.com")
                || (host.equals("goo.gl") && path.startsWith("/maps"))
                || (GOOGLE_HOST.matcher(host).matches() && path.startsWith("/maps"));
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }

    private static String validateReason(String raw) {
        String reason = trimmed(raw);
        if (reason.isEmpty() || reason.length() > 500) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica un motivo de 1 a 500 caracteres.");
        }
        return reason;
    }

    private String snapshotJson(Supplier supplier) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("name", supplier.name());
        value.put("phone", supplier.phone());
        value.put("city", supplier.city());
        value.put("address", supplier.address());
        value.put("mapsUrl", supplier.mapsUrl());
        return json.writeValueAsString(value);
    }

    private static boolean sameDetails(Supplier before, SupplierData after) {
        return before.name().equals(after.name()) && before.phone().equals(after.phone())
            && before.city().equals(after.city()) && before.address().equals(after.address())
            && before.mapsUrl().equals(after.mapsUrl());
    }

    private static String trimmed(String value) { return value == null ? "" : value.trim(); }
    private static SupplierProblem problem(HttpStatus status, String message) {
        return new SupplierProblem(status, message);
    }

    static final class SupplierProblem extends RuntimeException {
        private final HttpStatus status;

        SupplierProblem(HttpStatus status, String message) {
            super(message);
            this.status = status;
        }

        HttpStatus status() { return status; }
    }
}
