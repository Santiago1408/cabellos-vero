package bo.lamagiadelcabello.backend;

import java.io.Serial;
import java.io.Serializable;
import java.security.Principal;
import java.util.List;
import java.util.UUID;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import bo.lamagiadelcabello.backend.AccountRepository.Account;

record AccountPrincipal(UUID id) implements Principal, Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    @Override
    public String getName() {
        return id.toString();
    }

    static Authentication authentication(Account account) {
        return new UsernamePasswordAuthenticationToken(
            new AccountPrincipal(account.id()),
            null,
            List.of(new SimpleGrantedAuthority("ROLE_" + account.role()))
        );
    }
}
