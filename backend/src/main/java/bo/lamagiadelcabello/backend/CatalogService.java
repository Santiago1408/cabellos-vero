package bo.lamagiadelcabello.backend;

import java.util.List;
import java.util.UUID;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import bo.lamagiadelcabello.backend.CatalogRepository.Category;
import bo.lamagiadelcabello.backend.CatalogRepository.Length;

@Service
class CatalogService {

    private final CatalogRepository catalog;
    private final TransactionTemplate transactions;

    CatalogService(CatalogRepository catalog, TransactionTemplate transactions) {
        this.catalog = catalog;
        this.transactions = transactions;
    }

    List<Category> categories() { return catalog.categories(); }
    List<Length> lengths() { return catalog.lengths(); }

    Category category(String code) {
        return catalog.categories().stream().filter(row -> row.code().equals(code)).findFirst()
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Categoría no encontrada."));
    }

    Length length(int centimeters) {
        return catalog.lengths().stream().filter(row -> row.centimeters() == centimeters).findFirst()
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Longitud no encontrada."));
    }

    Category addCategory(String rawName) {
        String name = rawName == null ? "" : rawName.trim().replaceAll("\\s+", " ");
        if (name.isEmpty() || name.length() > 80) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica un nombre de categoría de 1 a 80 caracteres.");
        }
        try {
            return transactions.execute(status -> {
                if (catalog.categoryNameExists(name)) {
                    throw problem(HttpStatus.CONFLICT, "Esa categoría ya existe.");
                }
                Category result = new Category("cat-" + UUID.randomUUID(), name);
                catalog.addCategory(result.code(), result.displayName());
                return result;
            });
        } catch (DataIntegrityViolationException conflict) {
            throw problem(HttpStatus.CONFLICT, "Esa categoría ya existe.");
        }
    }

    Length addLength(Integer centimeters) {
        if (centimeters == null || centimeters <= 0) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica una longitud positiva en centímetros.");
        }
        try {
            return transactions.execute(status -> {
                if (catalog.lengthExists(centimeters)) {
                    throw problem(HttpStatus.CONFLICT, "Esa longitud ya existe.");
                }
                catalog.addLength(centimeters);
                return new Length(centimeters);
            });
        } catch (DataIntegrityViolationException conflict) {
            throw problem(HttpStatus.CONFLICT, "Esa longitud ya existe.");
        }
    }

    void removeCategory(String code) {
        try {
            transactions.executeWithoutResult(status -> {
                List<Category> rows = catalog.lockCategories();
                if (rows.stream().noneMatch(row -> row.code().equals(code))) {
                    throw problem(HttpStatus.NOT_FOUND, "Categoría no encontrada.");
                }
                if (rows.size() <= 1) {
                    throw problem(HttpStatus.CONFLICT, "Debe quedar al menos una categoría.");
                }
                catalog.deleteCategory(code);
            });
        } catch (DataIntegrityViolationException inUse) {
            throw problem(HttpStatus.CONFLICT, "No se puede quitar una categoría usada por registros del negocio.");
        }
    }

    void removeLength(int centimeters) {
        try {
            transactions.executeWithoutResult(status -> {
                List<Length> rows = catalog.lockLengths();
                if (rows.stream().noneMatch(row -> row.centimeters() == centimeters)) {
                    throw problem(HttpStatus.NOT_FOUND, "Longitud no encontrada.");
                }
                if (rows.size() <= 1) {
                    throw problem(HttpStatus.CONFLICT, "Debe quedar al menos una longitud.");
                }
                catalog.deleteLength(centimeters);
            });
        } catch (DataIntegrityViolationException inUse) {
            throw problem(HttpStatus.CONFLICT, "No se puede quitar una longitud usada por registros del negocio.");
        }
    }

    private static CatalogProblem problem(HttpStatus status, String message) {
        return new CatalogProblem(status, message);
    }

    static final class CatalogProblem extends RuntimeException {
        private final HttpStatus status;

        CatalogProblem(HttpStatus status, String message) {
            super(message);
            this.status = status;
        }

        HttpStatus status() { return status; }
    }
}
