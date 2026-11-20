package bo.lamagiadelcabello.backend;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import static org.mockito.Mockito.mock;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup;

@WebAppConfiguration
@SpringJUnitConfig(ModuleAccessTest.Config.class)
class ModuleAccessTest {
    @Configuration @EnableWebMvc @EnableWebSecurity @Import(SecurityConfiguration.class)
    static class Config {
        @Bean AccountRepository accounts() { return mock(AccountRepository.class); }
        @Bean Probe probe() { return new Probe(); }
    }
    @RestController static class Probe {
        @org.springframework.web.bind.annotation.PostMapping({"/api/employees/1/delete", "/api/employees/1/reset-password", "/api/branch-owners/1/delete", "/api/branch-owners/1/password"})
        String manageAccount() { return "ok"; }
        @GetMapping({"/api/inventory", "/api/inventory/type/50", "/api/reports", "/api/reports/summary", "/api/purchases", "/api/sales"})
        String read() { return "ok"; }
    }
    @Autowired WebApplicationContext context;
    MockMvc mvc;
    @BeforeEach void setup() { mvc = webAppContextSetup(context).apply(springSecurity()).build(); }
    @Test void onlyAdminsCanDeleteOrResetAccountsAndCsrfIsRequired() throws Exception {
        for(String path:new String[]{"/api/employees/1/delete", "/api/employees/1/reset-password", "/api/branch-owners/1/delete", "/api/branch-owners/1/password"}) {
            for(String role:new String[]{"EMPLOYEE", "BRANCH_OWNER"})
                mvc.perform(post(path).with(user("other").roles(role)).with(csrf())).andExpect(status().isForbidden());
            mvc.perform(post(path).with(user("admin").roles("ADMIN"))).andExpect(status().isForbidden());
            mvc.perform(post(path).with(user("admin").roles("ADMIN")).with(csrf())).andExpect(status().isOk());
        }
    }
    @Test void ownersCannotReadTheMainShopAndEmployeesCannotReadBranches() throws Exception {
        for (String path : new String[]{"/api/purchases", "/api/sales", "/api/inventory", "/api/reports"})
            mvc.perform(get(path).with(user("owner").roles("BRANCH_OWNER"))).andExpect(status().isForbidden());
        for (String path : new String[]{"/api/branches", "/api/branch-owners"})
            mvc.perform(get(path).with(user("employee").roles("EMPLOYEE"))).andExpect(status().isForbidden());
    }
    @Test void restrictsInventoryAndReportsIncludingDirectDetailRequests() throws Exception {
        for (String path : new String[]{"/api/inventory", "/api/inventory/type/50", "/api/reports", "/api/reports/summary"}) {
            mvc.perform(get(path).with(user("employee").roles("EMPLOYEE"))).andExpect(status().isForbidden());
            mvc.perform(get(path).with(user("admin").roles("ADMIN"))).andExpect(status().isOk());
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
        for (String path : new String[]{"/api/purchases", "/api/sales"})
            mvc.perform(get(path).with(user("employee").roles("EMPLOYEE"))).andExpect(status().isOk());
    }
}
