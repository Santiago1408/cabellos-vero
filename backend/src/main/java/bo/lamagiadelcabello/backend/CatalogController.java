package bo.lamagiadelcabello.backend;

import java.net.URI;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import bo.lamagiadelcabello.backend.CatalogRepository.Category;
import bo.lamagiadelcabello.backend.CatalogRepository.Length;
import bo.lamagiadelcabello.backend.CatalogService.CatalogProblem;

@RestController
@RequestMapping("/api/catalog")
class CatalogController {

    private final CatalogService catalog;

    CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    @GetMapping("/categories")
    List<Category> categories() { return catalog.categories(); }

    @GetMapping("/categories/{code}")
    Category category(@PathVariable String code) { return catalog.category(code); }

    @GetMapping("/lengths")
    List<Length> lengths() { return catalog.lengths(); }

    @GetMapping("/lengths/{centimeters}")
    Length length(@PathVariable int centimeters) { return catalog.length(centimeters); }

    @PostMapping("/categories")
    ResponseEntity<Category> addCategory(@RequestBody CategoryInput input) {
        Category created = catalog.addCategory(input == null ? null : input.displayName());
        return ResponseEntity.created(URI.create("/api/catalog/categories/" + created.code())).body(created);
    }

    @PostMapping("/lengths")
    ResponseEntity<Length> addLength(@RequestBody LengthInput input) {
        Length created = catalog.addLength(input == null ? null : input.centimeters());
        return ResponseEntity.created(URI.create("/api/catalog/lengths/" + created.centimeters())).body(created);
    }

    @DeleteMapping("/categories/{code}")
    ResponseEntity<Void> removeCategory(@PathVariable String code) {
        catalog.removeCategory(code);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/lengths/{centimeters}")
    ResponseEntity<Void> removeLength(@PathVariable int centimeters) {
        catalog.removeLength(centimeters);
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(CatalogProblem.class)
    ResponseEntity<Map<String, String>> catalogProblem(CatalogProblem error) {
        return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
    }

    record CategoryInput(String displayName) {}
    record LengthInput(Integer centimeters) {}
}
