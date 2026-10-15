package bo.lamagiadelcabello.backend;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
class SecurityConfiguration {

    @Bean
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    SecurityFilterChain securityFilterChain(
        HttpSecurity http,
        AccountRepository accounts,
        CsrfTokenRepository csrfTokens,
        SecurityContextRepository securityContexts
    ) throws Exception {
        http
            .csrf(csrf -> csrf.csrfTokenRepository(csrfTokens))
            .securityContext(context -> context.securityContextRepository(securityContexts))
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)
            .logout(AbstractHttpConfigurer::disable)
            .authorizeHttpRequests(requests -> requests
                .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                .requestMatchers("/api/auth/csrf", "/api/auth/login").permitAll()
                .requestMatchers("/api/auth/me", "/api/auth/logout", "/api/auth/password").authenticated()
                .requestMatchers("/api/employees", "/api/employees/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/catalog/**").authenticated()
                .requestMatchers("/api/catalog/**").hasRole("ADMIN")
                .requestMatchers("/api/suppliers", "/api/suppliers/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/purchases", "/api/purchases/**").authenticated()
                .requestMatchers("/api/purchases", "/api/purchases/**").hasRole("ADMIN")
                .anyRequest().denyAll())
            .exceptionHandling(errors -> errors
                .authenticationEntryPoint((request, response, error) -> {
                    response.setStatus(401);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"error\":\"Inicia sesión para continuar.\"}");
                })
                .accessDeniedHandler((request, response, error) -> {
                    response.setStatus(403);
                    response.setContentType("application/json;charset=UTF-8");
                    response.getWriter().write("{\"error\":\"Acceso denegado o token CSRF inválido.\"}");
                }))
            .addFilterBefore(new AccountSessionFilter(accounts), CsrfFilter.class);
        return http.build();
    }

    @Bean
    CsrfTokenRepository csrfTokenRepository() {
        return new HttpSessionCsrfTokenRepository();
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    UserDetailsService userDetailsService() {
        // La API JSON autentica explícitamente en AuthController; no se habilita un usuario por defecto.
        return username -> {
            throw new UsernameNotFoundException("La autenticación por formulario no está habilitada");
        };
    }
}
