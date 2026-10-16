package bo.lamagiadelcabello.backend;

import java.util.Locale;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/theme")
class ThemeController {
    private final JdbcTemplate jdbc;

    ThemeController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @GetMapping
    ThemeView current() {
        return jdbc.queryForObject("SELECT primary_color FROM ui_theme WHERE id = 1",
            (row, number) -> new ThemeView(row.getString("primary_color")));
    }

    @PutMapping
    ThemeView change(@RequestBody ThemeRequest request) {
        String color = request == null || request.primaryColor() == null ? ""
            : request.primaryColor().trim().toLowerCase(Locale.ROOT);
        if (!color.matches("#[0-9a-f]{6}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "El color principal debe tener el formato hexadecimal #RRGGBB.");
        }
        if (contrastWithWhite(color) < 4.5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Elige un color más oscuro para que los textos y botones sigan siendo legibles.");
        }
        jdbc.update("UPDATE ui_theme SET primary_color = ?, updated_at = now() WHERE id = 1", color);
        return new ThemeView(color);
    }

    private static double contrastWithWhite(String hex) {
        double red = channel(hex.substring(1, 3));
        double green = channel(hex.substring(3, 5));
        double blue = channel(hex.substring(5, 7));
        double luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        return 1.05 / (luminance + 0.05);
    }

    private static double channel(String hex) {
        double value = Integer.parseInt(hex, 16) / 255.0;
        return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> invalidColor(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode())
            .body(Map.of("error", error.getReason() == null ? "Color no válido." : error.getReason()));
    }

    record ThemeRequest(String primaryColor) {}
    record ThemeView(String primaryColor) {}
}
