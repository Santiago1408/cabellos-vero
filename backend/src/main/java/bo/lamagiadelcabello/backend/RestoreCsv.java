package bo.lamagiadelcabello.backend;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;

import tools.jackson.databind.ObjectMapper;

import bo.lamagiadelcabello.backend.BackupService.BackupProblem;

final class RestoreCsv {

    private static final int MAX_BYTES = 50 * 1024 * 1024;
    private static final String HEADER = "Tipo de registro;Identificador;Datos completos JSON";

    private RestoreCsv() {}

    static Parsed parse(byte[] bytes, ObjectMapper json) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) {
            throw invalid("El respaldo debe ser un CSV de hasta 50 MB.");
        }
        String source;
        try {
            source = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException badEncoding) {
            throw invalid("El respaldo debe estar codificado en UTF-8.");
        }
        if (source.startsWith("\uFEFF")) source = source.substring(1);
        int headerEnd = source.indexOf("\r\n");
        if (headerEnd < 0 || !source.substring(0, headerEnd).equals(HEADER)) {
            throw invalid("Las columnas del respaldo no coinciden con el formato esperado.");
        }
        List<List<String>> csvRows = readRows(source, headerEnd + 2);
        if (csvRows.isEmpty() || !csvRows.getFirst().get(0).equals("manifest")
            || !csvRows.getFirst().get(1).equals("backup")) {
            throw invalid("Falta el manifiesto al comienzo del respaldo.");
        }
        Map<String, Object> manifest = object(csvRows.getFirst().get(2), json);
        Object version = manifest.get("version");
        if (!"la-magia-del-cabello-csv".equals(manifest.get("format"))
            || (!Integer.valueOf(3).equals(version) && !Integer.valueOf(4).equals(version)
                && !Integer.valueOf(5).equals(version) && !Integer.valueOf(6).equals(version))
            || !"backend-relational".equals(manifest.get("schema"))
            || !"BOB".equals(manifest.get("currency"))
            || !"g".equals(manifest.get("weightUnit"))
            || !"America/La_Paz".equals(manifest.get("businessTimeZone"))
            || !(manifest.get("counts") instanceof Map<?, ?> counts)) {
            throw invalid("El respaldo no es una exportación compatible de las versiones 3, 4, 5 o 6.");
        }
        try { Instant.parse(String.valueOf(manifest.get("exportedAt"))); }
        catch (RuntimeException badDate) {
            throw invalid("La fecha de exportación del manifiesto es inválida.");
        }
        List<String> tables = Integer.valueOf(3).equals(version)
            ? BackupService.sourceTablesV3()
            : Integer.valueOf(6).equals(version)
                ? BackupService.sourceTables() : BackupService.sourceTablesV5();
        Set<String> allowed = new HashSet<>(tables);
        if (!counts.keySet().equals(allowed)) {
            throw invalid("El manifiesto no enumera todas las tablas del respaldo.");
        }
        Map<String, List<Row>> rows = new LinkedHashMap<>();
        for (String table : tables) rows.put(table, new ArrayList<>());
        Set<String> seen = new HashSet<>();
        for (int i = 1; i < csvRows.size(); i++) {
            List<String> row = csvRows.get(i);
            String table = row.get(0);
            String id = row.get(1);
            if (!allowed.contains(table) || id.isBlank() || !seen.add(table + "\u0000" + id)) {
                throw invalid("Tipo o identificador duplicado o inválido en la fila " + (i + 2) + ".");
            }
            Map<String, Object> values = object(row.get(2), json);
            String idField = table.equals("hair_category") ? "code"
                : table.equals("hair_length") ? "centimeters" : "id";
            if (!id.equals(String.valueOf(values.get(idField)))) {
                throw invalid("El identificador no coincide con el JSON en la fila " + (i + 2) + ".");
            }
            rows.get(table).add(new Row(id, row.get(2), values));
        }
        for (String table : allowed) {
            Object expected = counts.get(table);
            if (!(expected instanceof Number number) || number.intValue() != rows.get(table).size()
                || number.intValue() < 0) {
                throw invalid("La cantidad de registros de " + table + " no coincide con el manifiesto.");
            }
        }
        if (rows.get("backup_settings").size() != 1 || rows.get("app_user").isEmpty()) {
            throw invalid("El respaldo necesita la configuración y al menos un administrador.");
        }
        long admins = rows.get("app_user").stream()
            .filter(row -> "ADMIN".equals(row.values().get("role"))).count();
        if (admins != 1) throw invalid("El respaldo debe contener exactamente un administrador.");
        MessageDigest state = sha256();
        for (String table : tables) {
            if (table.equals("backup_settings")) continue;
            for (Row row : rows.get(table)) {
                state.update(table.getBytes(StandardCharsets.UTF_8));
                state.update((byte) 0);
                state.update(row.id().getBytes(StandardCharsets.UTF_8));
                state.update((byte) 0);
                state.update(row.data().getBytes(StandardCharsets.UTF_8));
                state.update((byte) '\n');
            }
        }
        state.update("backup_settings\0".getBytes(StandardCharsets.UTF_8));
        state.update("1\0".getBytes(StandardCharsets.UTF_8));
        state.update(String.valueOf(rows.get("backup_settings").getFirst().values()
            .get("interval_days")).getBytes(StandardCharsets.UTF_8));
        state.update((byte) '\n');
        Object expectedDigest = manifest.get("stateDigest");
        if (expectedDigest != null
            && !HexFormat.of().formatHex(state.digest()).equals(expectedDigest)) {
            throw invalid("El contenido del respaldo no coincide con su huella de integridad.");
        }
        return new Parsed(hash(bytes), Map.copyOf(rows), manifest);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> object(String value, ObjectMapper json) {
        try {
            Object decoded = json.readValue(value, Object.class);
            if (!(decoded instanceof Map<?, ?> map)) throw invalid("Cada fila debe contener un objeto JSON.");
            for (Object key : map.keySet()) {
                if (!(key instanceof String)) throw invalid("El JSON contiene una clave inválida.");
            }
            return (Map<String, Object>) map;
        } catch (BackupProblem bad) {
            throw bad;
        } catch (RuntimeException badJson) {
            throw invalid("Hay un objeto JSON inválido en el respaldo.");
        }
    }

    private static List<List<String>> readRows(String csv, int position) {
        List<List<String>> rows = new ArrayList<>();
        while (position < csv.length()) {
            List<String> fields = new ArrayList<>(3);
            for (int column = 0; column < 3; column++) {
                if (position >= csv.length() || csv.charAt(position++) != '"') {
                    throw invalid("El CSV contiene una celda sin comillas.");
                }
                StringBuilder field = new StringBuilder();
                boolean closed = false;
                while (position < csv.length()) {
                    char character = csv.charAt(position++);
                    if (character == '"') {
                        if (position < csv.length() && csv.charAt(position) == '"') {
                            field.append('"');
                            position++;
                        } else {
                            closed = true;
                            break;
                        }
                    } else field.append(character);
                }
                if (!closed) throw invalid("El CSV contiene una celda incompleta.");
                fields.add(field.toString());
                if (column < 2) {
                    if (position >= csv.length() || csv.charAt(position++) != ';') {
                        throw invalid("El CSV debe tener tres columnas separadas por punto y coma.");
                    }
                }
            }
            if (position + 1 < csv.length() && csv.charAt(position) == '\r'
                && csv.charAt(position + 1) == '\n') position += 2;
            else if (position != csv.length()) throw invalid("El CSV contiene una fila mal terminada.");
            rows.add(fields);
        }
        return rows;
    }

    private static String hash(byte[] bytes) {
        return HexFormat.of().formatHex(sha256().digest(bytes));
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 no está disponible.", impossible);
        }
    }

    private static BackupProblem invalid(String message) {
        return new BackupProblem(HttpStatus.BAD_REQUEST, message);
    }

    record Row(String id, String data, Map<String, Object> values) {}
    record Parsed(String sha256, Map<String, List<Row>> rows, Map<String, Object> manifest) {
        Map<String, Integer> counts() {
            Map<String, Integer> counts = new LinkedHashMap<>();
            for (String table : BackupService.sourceTables())
                counts.put(table, rows.getOrDefault(table, List.of()).size());
            return counts;
        }
    }
}
