package bo.lamagiadelcabello.backend;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import bo.lamagiadelcabello.backend.AccountRepository.Account;

final class AccountSessionFilter extends OncePerRequestFilter {

    static final String LOGIN_AT_ATTRIBUTE = "app.loginAtMillis";
    static final String SESSION_VERSION_ATTRIBUTE = "app.sessionVersion";
    private static final long MAX_AGE_MILLIS = Duration.ofDays(7).toMillis();

    private final AccountRepository accounts;

    AccountSessionFilter(AccountRepository accounts) {
        this.accounts = accounts;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return request.getRequestURI().startsWith("/actuator/health");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AccountPrincipal principal)) {
            chain.doFilter(request, response);
            return;
        }

        HttpSession session = request.getSession(false);
        Object loginAt = session == null ? null : session.getAttribute(LOGIN_AT_ATTRIBUTE);
        Object sessionVersion = session == null ? null : session.getAttribute(SESSION_VERSION_ATTRIBUTE);
        boolean expired = !(loginAt instanceof Long startedAt)
            || Instant.now().toEpochMilli() - startedAt >= MAX_AGE_MILLIS;
        Account account = accounts.findById(principal.id()).orElse(null);
        if (expired || account == null || !account.active()
            || !(sessionVersion instanceof Long version) || version != account.sessionVersion()) {
            if (session != null) session.invalidate();
            SecurityContextHolder.clearContext();
            chain.doFilter(request, response);
            return;
        }

        SecurityContext refreshed = SecurityContextHolder.createEmptyContext();
        refreshed.setAuthentication(AccountPrincipal.authentication(account));
        SecurityContextHolder.setContext(refreshed);

        String path = request.getRequestURI();
        if (account.mustChangePassword()
            && !path.equals("/api/auth/me")
            && !path.equals("/api/auth/csrf")
            && !path.equals("/api/auth/password")
            && !path.equals("/api/auth/logout")) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "Debes cambiar tu contraseña temporal.");
            return;
        }

        chain.doFilter(request, response);
    }
}
