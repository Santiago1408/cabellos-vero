package bo.lamagiadelcabello.backend;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import bo.lamagiadelcabello.backend.AccountRepository.Account;

@Service
class LoginService {

    private final AccountRepository accounts;
    private final PasswordEncoder passwords;
    private final TransactionTemplate transactions;
    private final String unusedPasswordHash;

    LoginService(AccountRepository accounts, PasswordEncoder passwords, TransactionTemplate transactions) {
        this.accounts = accounts;
        this.passwords = passwords;
        this.transactions = transactions;
        this.unusedPasswordHash = passwords.encode("not-an-application-account");
    }

    LoginResult login(String username, String password) {
        String normalized = username.trim().toLowerCase(Locale.ROOT);
        return transactions.execute(status -> {
            Account account = accounts.findByNormalizedUsernameForUpdate(normalized).orElse(null);
            if (account == null || !account.active()) {
                passwords.matches(password, unusedPasswordHash);
                return LoginResult.invalid();
            }

            Instant now = Instant.now();
            if (account.nextLoginAt() != null && account.nextLoginAt().isAfter(now)) {
                long seconds = Math.max(1, Duration.between(now, account.nextLoginAt()).toSeconds() + 1);
                return LoginResult.waitFor(seconds);
            }

            if (!passwords.matches(password, account.passwordHash())) {
                int failures = Math.min(account.failedLoginCount() + 1, 30);
                long seconds = failures < 3 ? 0 : Math.min(300, 1L << Math.min(failures - 2, 8));
                accounts.recordFailedLogin(account.id(), failures, seconds == 0 ? null : now.plusSeconds(seconds));
                return LoginResult.invalid();
            }

            accounts.recordSuccessfulLogin(account.id());
            return LoginResult.success(account);
        });
    }

    record LoginResult(Account account, long retryAfterSeconds) {
        static LoginResult success(Account account) { return new LoginResult(account, 0); }
        static LoginResult invalid() { return new LoginResult(null, 0); }
        static LoginResult waitFor(long seconds) { return new LoginResult(null, seconds); }
    }
}
