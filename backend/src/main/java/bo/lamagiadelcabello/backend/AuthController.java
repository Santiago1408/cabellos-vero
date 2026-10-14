package bo.lamagiadelcabello.backend;

import java.util.Map;
import java.util.UUID;
import java.time.LocalDate;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import bo.lamagiadelcabello.backend.AccountRepository.Account;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/auth")
class AuthController {

    private final AccountRepository accounts;
    private final LoginService logins;
    private final PasswordChangeService passwordChanges;
    private final SecurityContextRepository securityContexts;
    private final CsrfTokenRepository csrfTokens;

    AuthController(
        AccountRepository accounts,
        LoginService logins,
        PasswordChangeService passwordChanges,
        SecurityContextRepository securityContexts,
        CsrfTokenRepository csrfTokens
    ) {
        this.accounts = accounts;
        this.logins = logins;
        this.passwordChanges = passwordChanges;
        this.securityContexts = securityContexts;
        this.csrfTokens = csrfTokens;
    }

    @GetMapping("/csrf")
    CsrfView csrf(CsrfToken token) {
        return new CsrfView(token.getHeaderName(), token.getToken());
    }

    @PostMapping("/login")
    ResponseEntity<?> login(
        @Valid @RequestBody LoginRequest input,
        HttpServletRequest request,
        HttpServletResponse response
    ) {
        LoginService.LoginResult result = logins.login(input.username(), input.password());
        if (result.retryAfterSeconds() > 0) {
            return ResponseEntity.status(429)
                .header(HttpHeaders.RETRY_AFTER, Long.toString(result.retryAfterSeconds()))
                .body(Map.of("error", "Espera antes de volver a intentar iniciar sesión."));
        }
        if (result.account() == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Usuario o contraseña incorrectos."));
        }

        Account account = result.account();
        HttpSession session = request.getSession(true);
        request.changeSessionId();
        session.setAttribute(AccountSessionFilter.LOGIN_AT_ATTRIBUTE, System.currentTimeMillis());
        session.setAttribute(AccountSessionFilter.SESSION_VERSION_ATTRIBUTE, account.sessionVersion());
        session.setAttribute(FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME, account.id().toString());

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(AccountPrincipal.authentication(account));
        SecurityContextHolder.setContext(context);
        securityContexts.saveContext(context, request, response);
        csrfTokens.saveToken(null, request, response);
        return ResponseEntity.ok(AccountView.from(account));
    }

    @GetMapping("/me")
    AccountView me(Authentication authentication) {
        return AccountView.from(currentAccount(authentication));
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        csrfTokens.saveToken(null, request, response);
        HttpSession session = request.getSession(false);
        if (session != null) session.invalidate();
        SecurityContextHolder.clearContext();
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/password")
    ResponseEntity<?> changePassword(
        @Valid @RequestBody PasswordChangeRequest input,
        Authentication authentication,
        HttpServletRequest request
    ) {
        Account account = currentAccount(authentication);
        HttpSession session = request.getSession(false);
        if (session == null) throw new ResponseStatusException(UNAUTHORIZED);

        PasswordChangeService.ChangeResult result = passwordChanges.change(
            account.id(), input.currentPassword(), input.newPassword(), session.getId()
        );
        return switch (result.status()) {
            case CHANGED -> {
                session.setAttribute(AccountSessionFilter.SESSION_VERSION_ATTRIBUTE, result.newSessionVersion());
                yield ResponseEntity.noContent().build();
            }
            case CURRENT_INCORRECT -> ResponseEntity.badRequest()
                .body(Map.of("error", "La contraseña actual es incorrecta."));
            case SAME_PASSWORD -> ResponseEntity.badRequest()
                .body(Map.of("error", "La nueva contraseña debe ser diferente de la actual."));
            case ACCOUNT_UNAVAILABLE -> ResponseEntity.status(401)
                .body(Map.of("error", "La cuenta ya no está activa."));
        };
    }

    private Account currentAccount(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof AccountPrincipal principal)) {
            throw new ResponseStatusException(UNAUTHORIZED);
        }
        return accounts.findById(principal.id()).filter(Account::active)
            .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED));
    }

    record LoginRequest(
        @NotBlank @Size(max = 80) String username,
        @NotBlank @Size(max = 1024) String password
    ) {}

    record PasswordChangeRequest(
        @NotBlank @Size(max = 1024) String currentPassword,
        @NotBlank @Size(min = 8, max = 1024) String newPassword
    ) {}

    record CsrfView(String headerName, String token) {}

    record AccountView(UUID id, String username, String displayName, String role,
                       String ci, LocalDate birthDate, String phone, boolean mustChangePassword) {
        static AccountView from(Account account) {
            return new AccountView(
                account.id(), account.username(), account.displayName(), account.role(),
                account.ci(), account.birthDate(), account.phone(), account.mustChangePassword()
            );
        }
    }
}
