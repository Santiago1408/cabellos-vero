package bo.lamagiadelcabello.backend;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

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

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import bo.lamagiadelcabello.backend.EmployeeRepository.Employee;
import bo.lamagiadelcabello.backend.EmployeeRepository.History;
import bo.lamagiadelcabello.backend.EmployeeService.EmployeeData;
import bo.lamagiadelcabello.backend.EmployeeService.EmployeeProblem;

@RestController
@RequestMapping("/api/employees")
class EmployeeController {

    private final EmployeeService employees;
    private final ObjectMapper json;

    EmployeeController(EmployeeService employees, ObjectMapper json) {
        this.employees = employees;
        this.json = json;
    }

    @GetMapping
    List<EmployeeView> list() {
        return employees.list().stream().map(EmployeeView::from).toList();
    }

    @GetMapping("/{id}")
    EmployeeDetail detail(@PathVariable UUID id) {
        Employee employee = employees.get(id);
        return new EmployeeDetail(EmployeeView.from(employee),
            employees.history(id).stream().map(this::historyView).toList());
    }

    @PostMapping
    ResponseEntity<TemporaryPasswordView> create(@RequestBody EmployeeInput input, Authentication authentication) {
        EmployeeService.Created created = employees.create(input.data(), actorId(authentication));
        return ResponseEntity.created(URI.create("/api/employees/" + created.employee().id()))
            .body(new TemporaryPasswordView(EmployeeView.from(created.employee()), created.temporaryPassword()));
    }

    @PutMapping("/{id}")
    EmployeeView edit(@PathVariable UUID id, @RequestBody EmployeeEditInput input, Authentication authentication) {
        return EmployeeView.from(employees.edit(id, input.data(), input.reason(), actorId(authentication)));
    }

    @PostMapping("/{id}/deactivate")
    EmployeeView deactivate(@PathVariable UUID id, @RequestBody ReasonInput input, Authentication authentication) {
        return EmployeeView.from(employees.setActive(id, false, input.reason(), actorId(authentication)));
    }

    @PostMapping("/{id}/reactivate")
    EmployeeView reactivate(@PathVariable UUID id, @RequestBody ReasonInput input, Authentication authentication) {
        return EmployeeView.from(employees.setActive(id, true, input.reason(), actorId(authentication)));
    }

    @PostMapping("/{id}/reset-password")
    TemporaryPasswordView resetPassword(@PathVariable UUID id, @RequestBody ReasonInput input,
                                        Authentication authentication) {
        EmployeeService.Reset reset = employees.resetPassword(id, input.reason(), actorId(authentication));
        return new TemporaryPasswordView(EmployeeView.from(reset.employee()), reset.temporaryPassword());
    }

    @ExceptionHandler(EmployeeProblem.class)
    ResponseEntity<Map<String, String>> employeeProblem(EmployeeProblem error) {
        return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
    }

    private HistoryView historyView(History row) {
        return new HistoryView(row.id(), row.changedAt(), row.eventType(), row.source(),
            row.actorUserId(), row.reason(), parse(row.oldValuesJson()), parse(row.newValuesJson()));
    }

    private JsonNode parse(String value) {
        return value == null ? null : json.readTree(value);
    }

    private static UUID actorId(Authentication authentication) {
        return ((AccountPrincipal) authentication.getPrincipal()).id();
    }

    record EmployeeInput(String username, String fullName, String ci, LocalDate birthDate, String phone) {
        EmployeeData data() { return new EmployeeData(username, fullName, ci, birthDate, phone); }
    }

    record EmployeeEditInput(String username, String fullName, String ci,
                             LocalDate birthDate, String phone, String reason) {
        EmployeeData data() { return new EmployeeData(username, fullName, ci, birthDate, phone); }
    }

    record ReasonInput(String reason) {}

    record EmployeeView(UUID id, String username, String fullName, String ci, LocalDate birthDate,
                        String phone, boolean active, boolean mustChangePassword,
                        Instant createdAt, Instant updatedAt) {
        static EmployeeView from(Employee employee) {
            return new EmployeeView(employee.id(), employee.username(), employee.fullName(), employee.ci(),
                employee.birthDate(), employee.phone(), employee.active(), employee.mustChangePassword(),
                employee.createdAt(), employee.updatedAt());
        }
    }

    record EmployeeDetail(EmployeeView employee, List<HistoryView> history) {}
    record TemporaryPasswordView(EmployeeView employee, String temporaryPassword) {}
    record HistoryView(long id, Instant changedAt, String eventType, String source,
                       UUID actorUserId, String reason, JsonNode oldValues, JsonNode newValues) {}
}
