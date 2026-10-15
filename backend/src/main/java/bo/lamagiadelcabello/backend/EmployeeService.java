package bo.lamagiadelcabello.backend;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.ObjectMapper;

import bo.lamagiadelcabello.backend.EmployeeRepository.Employee;
import bo.lamagiadelcabello.backend.EmployeeRepository.History;

@Service
class EmployeeService {

    private static final Pattern USERNAME = Pattern.compile("[\\p{L}\\p{N}._-]{1,80}");
    private static final char[] PASSWORD_CHARS =
        "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_".toCharArray();

    private final EmployeeRepository employees;
    private final PasswordEncoder passwords;
    private final TransactionTemplate transactions;
    private final ObjectMapper json;
    private final SecureRandom random = new SecureRandom();

    EmployeeService(EmployeeRepository employees, PasswordEncoder passwords,
                    TransactionTemplate transactions, ObjectMapper json) {
        this.employees = employees;
        this.passwords = passwords;
        this.transactions = transactions;
        this.json = json;
    }

    List<Employee> list() {
        return employees.findAll();
    }

    Employee get(UUID id) {
        return employees.findById(id).orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Empleado no encontrado."));
    }

    List<History> history(UUID id) {
        get(id);
        return employees.history(id);
    }

    Created create(EmployeeData raw, UUID actorId) {
        EmployeeData data = validate(raw);
        String temporaryPassword = generatePassword();
        String hash = passwords.encode(temporaryPassword);
        UUID id = UUID.randomUUID();
        try {
            Employee employee = transactions.execute(status -> {
                ensureUnique(data, null);
                employees.create(id, data.username(), normalize(data.username()), hash,
                    data.fullName(), data.ci(), data.birthDate(), data.phone());
                Employee saved = get(id);
                employees.addHistory(id, "ACCOUNT_CREATED", actorId, null,
                    null, snapshotJson(saved));
                return saved;
            });
            return new Created(employee, temporaryPassword);
        } catch (DataIntegrityViolationException conflict) {
            throw problem(HttpStatus.CONFLICT, "El usuario o CI ya está registrado.");
        }
    }

    Employee edit(UUID id, EmployeeData raw, String rawReason, UUID actorId) {
        EmployeeData data = validate(raw);
        String reason = validateReason(rawReason);
        try {
            return transactions.execute(status -> {
                Employee before = locked(id);
                ensureUnique(data, id);
                if (sameDetails(before, data)) {
                    throw problem(HttpStatus.BAD_REQUEST, "No hay cambios en los datos del empleado.");
                }
                employees.update(id, data.username(), normalize(data.username()),
                    data.fullName(), data.ci(), data.birthDate(), data.phone());
                Employee after = get(id);
                employees.addHistory(id, "ACCOUNT_UPDATED", actorId, reason,
                    snapshotJson(before), snapshotJson(after));
                return after;
            });
        } catch (DataIntegrityViolationException conflict) {
            throw problem(HttpStatus.CONFLICT, "El usuario o CI ya está registrado.");
        }
    }

    Employee setActive(UUID id, boolean active, String rawReason, UUID actorId) {
        String reason = validateReason(rawReason);
        return transactions.execute(status -> {
            Employee before = locked(id);
            if (before.active() == active) {
                throw problem(HttpStatus.CONFLICT, active
                    ? "El empleado ya está activo." : "El empleado ya está desactivado.");
            }
            employees.setActive(id, active);
            employees.closeAllSessions(id);
            Employee after = get(id);
            employees.addHistory(id, active ? "ACCOUNT_REACTIVATED" : "ACCOUNT_DEACTIVATED",
                actorId, reason, snapshotJson(before), snapshotJson(after));
            return after;
        });
    }

    Reset resetPassword(UUID id, String rawReason, UUID actorId) {
        String reason = validateReason(rawReason);
        String temporaryPassword = generatePassword();
        String hash = passwords.encode(temporaryPassword);
        Employee employee = transactions.execute(status -> {
            Employee before = locked(id);
            if (!before.active()) {
                throw problem(HttpStatus.CONFLICT, "Reactiva al empleado antes de restablecer su contraseña.");
            }
            employees.resetPassword(id, hash);
            employees.closeAllSessions(id);
            Employee after = get(id);
            employees.addHistory(id, "PASSWORD_RESET", actorId, reason,
                json.writeValueAsString(Map.of("mustChangePassword", before.mustChangePassword())),
                json.writeValueAsString(Map.of("mustChangePassword", true)));
            return after;
        });
        return new Reset(employee, temporaryPassword);
    }

    private Employee locked(UUID id) {
        return employees.findByIdForUpdate(id)
            .orElseThrow(() -> problem(HttpStatus.NOT_FOUND, "Empleado no encontrado."));
    }

    private void ensureUnique(EmployeeData data, UUID exceptId) {
        if (employees.usernameIsUsed(normalize(data.username()), exceptId)) {
            throw problem(HttpStatus.CONFLICT, "Ese nombre de usuario ya está registrado.");
        }
        if (employees.ciIsUsed(data.ci(), exceptId)) {
            throw problem(HttpStatus.CONFLICT, "Ese CI ya está registrado.");
        }
    }

    private static EmployeeData validate(EmployeeData data) {
        if (data == null) throw problem(HttpStatus.BAD_REQUEST, "Faltan los datos del empleado.");
        String username = trimmed(data.username());
        String fullName = trimmed(data.fullName());
        String ci = trimmed(data.ci());
        String phone = trimmed(data.phone());
        if (!USERNAME.matcher(username).matches()) {
            throw problem(HttpStatus.BAD_REQUEST,
                "El usuario debe tener de 1 a 80 letras, números, puntos, guiones o guiones bajos, sin espacios.");
        }
        if (fullName.isEmpty() || fullName.length() > 160) {
            throw problem(HttpStatus.BAD_REQUEST, "El nombre completo es obligatorio y admite hasta 160 caracteres.");
        }
        if (ci.isEmpty() || ci.length() > 40) {
            throw problem(HttpStatus.BAD_REQUEST, "El CI es obligatorio y admite hasta 40 caracteres.");
        }
        if (phone.isEmpty() || phone.length() > 40) {
            throw problem(HttpStatus.BAD_REQUEST, "El celular es obligatorio y admite hasta 40 caracteres.");
        }
        if (data.birthDate() == null || data.birthDate().isAfter(LocalDate.now())) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica una fecha de nacimiento válida, no futura.");
        }
        return new EmployeeData(username, fullName, ci, data.birthDate(), phone);
    }

    private static String validateReason(String raw) {
        String reason = trimmed(raw);
        if (reason.isEmpty() || reason.length() > 500) {
            throw problem(HttpStatus.BAD_REQUEST, "Indica un motivo de 1 a 500 caracteres.");
        }
        return reason;
    }

    private String generatePassword() {
        char[] value = new char[20];
        for (int i = 0; i < value.length; i++) value[i] = PASSWORD_CHARS[random.nextInt(PASSWORD_CHARS.length)];
        return new String(value);
    }

    private String snapshotJson(Employee employee) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("username", employee.username());
        value.put("fullName", employee.fullName());
        value.put("ci", employee.ci());
        value.put("birthDate", employee.birthDate().toString());
        value.put("phone", employee.phone());
        value.put("active", employee.active());
        value.put("mustChangePassword", employee.mustChangePassword());
        return json.writeValueAsString(value);
    }

    private static boolean sameDetails(Employee before, EmployeeData data) {
        return before.username().equals(data.username())
            && before.fullName().equals(data.fullName())
            && before.ci().equals(data.ci())
            && before.birthDate().equals(data.birthDate())
            && before.phone().equals(data.phone());
    }

    private static String normalize(String value) { return value.toLowerCase(Locale.ROOT); }
    private static String trimmed(String value) { return value == null ? "" : value.trim(); }
    private static EmployeeProblem problem(HttpStatus status, String message) {
        return new EmployeeProblem(status, message);
    }

    record EmployeeData(String username, String fullName, String ci, LocalDate birthDate, String phone) {}
    record Created(Employee employee, String temporaryPassword) {}
    record Reset(Employee employee, String temporaryPassword) {}

    static final class EmployeeProblem extends RuntimeException {
        private final HttpStatus status;

        EmployeeProblem(HttpStatus status, String message) {
            super(message);
            this.status = status;
        }

        HttpStatus status() { return status; }
    }
}
