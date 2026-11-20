package bo.lamagiadelcabello.backend;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class EmployeeServiceTest {
    @Test void createsWithAdministratorPasswordAndDoesNotAuditTheSecret() {
        var repository = mock(EmployeeRepository.class);
        var transactions = mock(TransactionTemplate.class);
        when(transactions.execute(any())).thenAnswer(invocation ->
            ((org.springframework.transaction.support.TransactionCallback<?>) invocation.getArgument(0)).doInTransaction(null));
        var passwords = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        var actor = UUID.randomUUID();
        when(repository.findById(any())).thenAnswer(invocation -> Optional.of(new EmployeeRepository.Employee(
            invocation.getArgument(0), "ana", "Ana", "123", LocalDate.of(1990,1,1), "789", true, false, Instant.now(), Instant.now())));
        var service = new EmployeeService(repository, passwords, transactions, new ObjectMapper());
        var data = new EmployeeService.EmployeeData("ana", "Ana", "123", LocalDate.of(1990,1,1), "789");
        var result = service.create(data, "1234", actor);
        assertFalse(result.employee().mustChangePassword());
        var hash = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(repository).create(any(), eq("ana"), eq("ana"), hash.capture(), eq("Ana"), eq("123"), eq(data.birthDate()), eq("789"));
        assertTrue(passwords.matches("1234", hash.getValue()));
        var snapshot = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(repository).addHistory(any(), eq("ACCOUNT_CREATED"), eq(actor), isNull(), isNull(), snapshot.capture());
        assertFalse(snapshot.getValue().contains("1234"));
        assertFalse(snapshot.getValue().contains(hash.getValue()));
        assertThrows(EmployeeService.EmployeeProblem.class, () -> service.create(data, " ", actor));
        assertThrows(EmployeeService.EmployeeProblem.class, () -> service.create(data, null, actor));
        assertThrows(EmployeeService.EmployeeProblem.class, () -> service.create(data, "é".repeat(37), actor));
    }
}
