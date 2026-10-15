package bo.lamagiadelcabello.backend;

import java.util.Map;
import java.util.UUID;
import java.io.IOException;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import bo.lamagiadelcabello.backend.BackupService.BackupProblem;
import bo.lamagiadelcabello.backend.BackupService.Download;
import bo.lamagiadelcabello.backend.BackupService.Settings;

@RestController
@RequestMapping("/api/backups")
class BackupController {

    private final BackupService backups;
    private final RestoreService restores;

    BackupController(BackupService backups, RestoreService restores) {
        this.backups = backups;
        this.restores = restores;
    }

    @GetMapping("/settings")
    Settings settings() { return backups.settings(); }

    @PutMapping("/settings")
    Settings changeInterval(@RequestBody IntervalRequest input) {
        return backups.changeInterval(input == null ? null : input.intervalDays());
    }

    @PostMapping("/export")
    ResponseEntity<byte[]> export() {
        return fileResponse(backups.export());
    }

    @PostMapping(value = "/restore/preview", consumes = "multipart/form-data")
    RestoreService.Preview preview(@RequestPart("file") MultipartFile file,
                                   Authentication authentication) {
        return restores.preview(bytes(file), actorId(authentication));
    }

    @PostMapping("/restore/{id}/pre-backup")
    ResponseEntity<byte[]> preRestoreBackup(@PathVariable UUID id,
                                            Authentication authentication) {
        return fileResponse(restores.preRestoreBackup(id, actorId(authentication)));
    }

    @PostMapping("/restore/{id}/confirm-pre-backup")
    RestoreService.Preparation confirmPreRestoreBackup(@PathVariable UUID id,
                                                        Authentication authentication) {
        return restores.confirmPreRestoreBackup(id, actorId(authentication));
    }

    @PostMapping(value = "/restore/{id}", consumes = "multipart/form-data")
    RestoreService.Result restore(@PathVariable UUID id,
                                  @RequestPart("file") MultipartFile file,
                                  @RequestParam("confirmation") String confirmation,
                                  Authentication authentication) {
        return restores.restore(id, bytes(file), confirmation, actorId(authentication));
    }

    private static ResponseEntity<byte[]> fileResponse(Download file) {
        return ResponseEntity.ok()
            .cacheControl(CacheControl.noStore())
            .header(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + file.fileName() + "\"")
            .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
            .body(file.bytes());
    }

    private static UUID actorId(Authentication authentication) {
        return ((AccountPrincipal) authentication.getPrincipal()).id();
    }

    private static byte[] bytes(MultipartFile file) {
        try { return file.getBytes(); }
        catch (IOException unreadable) {
            throw new BackupProblem(HttpStatus.BAD_REQUEST,
                "No se pudo leer el archivo de respaldo.");
        }
    }

    @PostMapping("/confirm")
    Settings confirmSaved() { return backups.confirmSaved(); }

    @ExceptionHandler(BackupProblem.class)
    ResponseEntity<Map<String, String>> backupProblem(BackupProblem error) {
        return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String, String>> oversized(MaxUploadSizeExceededException error) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
            .body(Map.of("error", "El respaldo supera el límite de 50 MB."));
    }

    record IntervalRequest(Integer intervalDays) {}
}
