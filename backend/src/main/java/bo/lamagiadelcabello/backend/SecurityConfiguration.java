package bo.lamagiadelcabello.backend;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {

    @Bean
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(requests -> requests
            .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
            .anyRequest().denyAll());
        return http.build();
    }

    @Bean
    UserDetailsService userDetailsService() {
        // El inicio de sesión real se incorporará junto al modelo de cuentas y permisos.
        return username -> {
            throw new UsernameNotFoundException("No hay cuentas configuradas todavía");
        };
    }
}
