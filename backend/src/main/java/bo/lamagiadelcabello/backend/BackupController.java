package bo.lamagiadelcabello.backend;

import java.util.Map;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import bo.lamagiadelcabello.backend.BackupService.BackupProblem;
import bo.lamagiadelcabello.backend.BackupService.Download;
import bo.lamagiadelcabello.backend.BackupService.Settings;

@RestController
@RequestMapping("/api/backups")
class BackupController {

    private final BackupService backups;

    BackupController(BackupService backups) { this.backups = backups; }

    @GetMapping("/settings")
    Settings settings() { return backups.settings(); }

    @PutMapping("/settings")
    Settings changeInterval(@RequestBody IntervalRequest input) {
        return backups.changeInterval(input == null ? null : input.intervalDays());
    }

    @PostMapping("/export")
    ResponseEntity<byte[]> export() {
        Download file = backups.export();
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .header(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + file.fileName() + "\"")
            .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
            .body(file.bytes());
    }

    @PostMapping("/confirm")
    Settings confirmSaved() { return backups.confirmSaved(); }

    @ExceptionHandler(BackupProblem.class)
    ResponseEntity<Map<String, String>> backupProblem(BackupProblem error) {
        return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
    }

    record IntervalRequest(Integer intervalDays) {}
}
