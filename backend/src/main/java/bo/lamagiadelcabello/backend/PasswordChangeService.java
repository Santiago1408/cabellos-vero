package bo.lamagiadelcabello.backend;

import java.util.UUID;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import bo.lamagiadelcabello.backend.AccountRepository.Account;

@Service
class PasswordChangeService {

    private final AccountRepository accounts;
    private final PasswordEncoder passwords;
    private final TransactionTemplate transactions;

    PasswordChangeService(AccountRepository accounts, PasswordEncoder passwords, TransactionTemplate transactions) {
        this.accounts = accounts;
        this.passwords = passwords;
        this.transactions = transactions;
    }

    ChangeResult change(UUID accountId, String currentPassword, String newPassword, String currentSessionId) {
        return transactions.execute(status -> {
            Account account = accounts.findByIdForUpdate(accountId).orElse(null);
            if (account == null || !account.active()) return ChangeResult.error(Result.ACCOUNT_UNAVAILABLE);
            if (!passwords.matches(currentPassword, account.passwordHash())) return ChangeResult.error(Result.CURRENT_INCORRECT);
            if (passwords.matches(newPassword, account.passwordHash())) return ChangeResult.error(Result.SAME_PASSWORD);

            long newVersion = accounts.changePassword(accountId, passwords.encode(newPassword));
            accounts.closeOtherSessions(accountId, currentSessionId);
            return new ChangeResult(Result.CHANGED, newVersion);
        });
    }

    record ChangeResult(Result status, long newSessionVersion) {
        static ChangeResult error(Result status) { return new ChangeResult(status, -1); }
    }

    enum Result {
        CHANGED,
        CURRENT_INCORRECT,
        SAME_PASSWORD,
        ACCOUNT_UNAVAILABLE
    }
}
