package bo.lamagiadelcabello.backend;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import javax.sql.DataSource;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import bo.lamagiadelcabello.backend.BranchService.*;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BranchIntegrationTest {
 static DataSource source; EmbeddedPostgres postgres; AnnotationConfigApplicationContext context;
 JdbcTemplate db; BranchService service; BackupService backups; RestoreService restores; UUID admin,owner,branch;
 @Configuration @EnableTransactionManagement static class Config {
  @Bean DataSource ds(){return source;} @Bean JdbcTemplate jdbc(DataSource ds){return new JdbcTemplate(ds);}
  @Bean PlatformTransactionManager transactionManager(DataSource ds){return new JdbcTransactionManager(ds);}
  @Bean ObjectMapper json(){return new ObjectMapper();}
  @Bean PasswordEncoder passwords(){return PasswordEncoderFactories.createDelegatingPasswordEncoder();}
  @Bean AccountRepository accounts(JdbcTemplate db){return new AccountRepository(db);}
  @Bean EmployeeRepository employeeRepository(JdbcTemplate db){return new EmployeeRepository(db);}
  @Bean EmployeeService employees(EmployeeRepository r,PasswordEncoder p,PlatformTransactionManager m,ObjectMapper j){return new EmployeeService(r,p,new org.springframework.transaction.support.TransactionTemplate(m),j);}
  @Bean BranchService branches(JdbcTemplate db,AccountRepository a,PasswordEncoder p,ObjectMapper j){return new BranchService(db,a,p,j);}
  @Bean BackupService backup(JdbcTemplate db,ObjectMapper j,PlatformTransactionManager m){return new BackupService(db,j,m);}
  @Bean RestoreService restore(JdbcTemplate db,ObjectMapper j,PasswordEncoder p,BackupService b,PlatformTransactionManager m){return new RestoreService(db,j,p,b,m);}
 }
 @BeforeAll void start()throws Exception {postgres=EmbeddedPostgres.builder().setPort(0).start();source=postgres.getPostgresDatabase();Flyway.configure().dataSource(source).load().migrate();context=new AnnotationConfigApplicationContext(Config.class);db=context.getBean(JdbcTemplate.class);service=context.getBean(BranchService.class);backups=context.getBean(BackupService.class);restores=context.getBean(RestoreService.class);}
 @AfterAll void stop()throws Exception {if(context!=null)context.close();if(postgres!=null)postgres.close();}
 @BeforeEach void reset(){db.execute("TRUNCATE TABLE "+String.join(",",BackupService.sourceTables()));db.update("INSERT INTO backup_settings(id) VALUES (1)");db.update("INSERT INTO ui_theme(id) VALUES (1)");admin=UUID.randomUUID();db.update("INSERT INTO app_user(id,username,username_normalized,password_hash,role,active,must_change_password) VALUES (?,'admin','admin','hash','ADMIN',TRUE,FALSE)",admin);owner=service.createOwner(new OwnerInput("dueno","Dueño","789","1234"),admin);branch=service.create("Sucursal centro",admin);service.assign(branch,new Assign(owner,"Asignación inicial"),admin);}
 BigDecimal n(String s){return new BigDecimal(s);}
 void session(UUID id){long now=System.currentTimeMillis();db.update("INSERT INTO spring_session(primary_id,session_id,creation_time,last_access_time,max_inactive_interval,expiry_time,principal_name) VALUES (?,?,?,?,?,?,?)",UUID.randomUUID().toString(),UUID.randomUUID().toString(),now,now,86400,now+86400000,id.toString());}
 void noSessions(UUID id){assertEquals(0,db.queryForObject("SELECT count(*) FROM spring_session WHERE principal_name=?",Integer.class,id.toString()));}
 UUID cash(String kind,String amount,UUID target,UUID actor){return service.cash(branch,new CashInput(UUID.randomUUID(),kind,n(amount),target,"Movimiento de prueba"),actor);}
 UUID buy(String label,String weight,String amount){return service.purchase(branch,new PurchaseInput(UUID.randomUUID(),label,"Cliente",n(weight),n(amount),"Prueba"),owner);}
 UUID sell(UUID lot,String weight,String amount){return service.sell(branch,new SaleInput(UUID.randomUUID(),List.of(new Part(lot,n(weight))),n(amount),"CASH","Cliente",""),owner);}
 void same(String expected,BigDecimal actual){assertEquals(0,n(expected).compareTo(actual),expected+" vs "+actual);}
 @Test void capitalAdvancesExpensesAndActualDeliveries(){cash("CAPITAL","1000",null,admin);cash("ADVANCE","100",null,admin);cash("EXPENSE","60",null,owner);UUID lot=buy("A","100","200");sell(lot,"100","300");var b=service.detail(branch,owner).balances();same("50",b.adminDue());same("50",b.ownerDue());same("100",b.advance());same("1040",b.operatingCash());UUID refund=cash("ADVANCE_RETURN","100",null,admin);cash("ADMIN_PROFIT","50",null,admin);cash("OWNER_WITHDRAWAL","50",null,owner);b=service.detail(branch,admin).balances();same("940",b.cash());same("1000",b.capital());same("0",b.advance());same("0",b.ownerDue());BranchIntegrity.validate(db);}
 @Test void rejectsLossAndOversellingWithoutPartialWritesAndHandlesRetries(){cash("CAPITAL","1000",null,admin);UUID lot=buy("A","100","200");assertThrows(Problem.class,()->sell(lot,"50","99.99"));same("100",service.detail(branch,owner).lots().getFirst().remainingWeight());var input=new SaleInput(UUID.randomUUID(),List.of(new Part(lot,n("50"))),n("150"),"QR","Cliente","");assertEquals(service.sell(branch,input,owner),service.sell(branch,input,owner));assertThrows(Problem.class,()->service.sell(branch,new SaleInput(input.requestKey(),input.items(),n("151"),"QR","Cliente",""),owner));assertThrows(Problem.class,()->sell(lot,"51","1000"));same("50",service.detail(branch,owner).lots().getFirst().remainingWeight());BranchIntegrity.validate(db);}
 @Test void mixesKeepOriginsAndCosts(){cash("CAPITAL","1000",null,admin);UUID a=buy("A","100","200"),b=buy("B","100","300");UUID mixed=service.mix(branch,new MixInput(UUID.randomUUID(),"Mezcla",List.of(new Part(a,n("50")),new Part(b,n("50"))),"Mezcla"),owner);var d=service.detail(branch,owner);same("500",d.balances().stockCost());same("500",d.balances().cash());assertEquals(2,d.lots().stream().filter(l->l.id().equals(mixed)).findFirst().orElseThrow().sources().size());sell(mixed,"40","150");same("100",service.detail(branch,owner).sales().getFirst().cost());same("25",service.detail(branch,owner).balances().adminDue());BranchIntegrity.validate(db);}
 @Test void splitRoundingDoesNotLoseCostCents(){cash("CAPITAL","100",null,admin);UUID lot=buy("A","3","0.01");sell(lot,"1","0.01");sell(lot,"1","0.02");sell(lot,"1","0.01");var d=service.detail(branch,owner);same("0",d.balances().stockCost());same("0.01",d.sales().stream().map(SaleView::cost).reduce(BranchMath.ZERO,BigDecimal::add));same("0.03",d.sales().stream().map(s->s.adminShare().add(s.ownerShare())).reduce(BranchMath.ZERO,BigDecimal::add));BranchIntegrity.validate(db);}
 @Test void reassignmentSeparatesPermissionsAndFormerOwnerProfits(){cash("CAPITAL","1000",null,admin);UUID lot=buy("A","100","200");sell(lot,"50","150");UUID next=service.createOwner(new OwnerInput("nuevo","Nuevo","","1"),admin);service.assign(branch,new Assign(next,"Cambio"),admin);assertThrows(Problem.class,()->service.detail(branch,owner));assertTrue(service.list(owner).isEmpty());assertEquals(next,service.detail(branch,next).branch().ownerId());assertThrows(Problem.class,()->service.cash(branch,new CashInput(UUID.randomUUID(),"OWNER_WITHDRAWAL",n("1"),owner,"Intento"),next));cash("OWNER_WITHDRAWAL","25",owner,admin);same("0",service.detail(branch,admin).balances().ownerDue());UUID other=service.create("Otra",admin);assertThrows(Problem.class,()->service.assign(other,new Assign(next,"Doble"),admin));assertThrows(Problem.class,()->service.detail(other,next));service.editOwner(next,new OwnerEdit("nuevo","Nuevo","",false,"Baja"),admin);assertThrows(Problem.class,()->service.detail(branch,next));}
 @Test void cannotVoidSalesAfterProfitWithdrawalUntilWithdrawalIsReversed(){cash("CAPITAL","1000",null,admin);UUID lot=buy("A","100","200"),sale=sell(lot,"100","300"),withdraw=cash("OWNER_WITHDRAWAL","50",null,owner);assertThrows(Problem.class,()->service.reverse(branch,new ReverseInput(UUID.randomUUID(),"SALE",sale,"Corregir"),admin));service.reverse(branch,new ReverseInput(UUID.randomUUID(),"CASH",withdraw,"Devolver"),admin);service.reverse(branch,new ReverseInput(UUID.randomUUID(),"SALE",sale,"Corregir"),admin);same("100",service.detail(branch,owner).lots().getFirst().remainingWeight());service.reverse(branch,new ReverseInput(UUID.randomUUID(),"PURCHASE",lot,"Corregir"),admin);same("1000",service.detail(branch,owner).balances().cash());BranchIntegrity.validate(db);}
 @Test void simultaneousSalesCannotConsumeTheSameHead()throws Exception {cash("CAPITAL","1000",null,admin);UUID lot=buy("A","100","200");try(var executor=Executors.newFixedThreadPool(2)){CountDownLatch gate=new CountDownLatch(1);Callable<Boolean> action=()->{gate.await();try{sell(lot,"100","300");return true;}catch(Problem e){return false;}};var a=executor.submit(action);var b=executor.submit(action);gate.countDown();assertNotEquals(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));}same("50",service.detail(branch,owner).balances().adminDue());BranchIntegrity.validate(db);}
 @Test void backupRoundTripRestoresBranchesAndReversals(){cash("CAPITAL","1000",null,admin);UUID lot=buy("A","100","200"),sale=sell(lot,"20","100");service.reverse(branch,new ReverseInput(UUID.randomUUID(),"SALE",sale,"Corregir"),admin);var saved=backups.snapshot();assertEquals(8,RestoreCsv.parse(saved.bytes(),new ObjectMapper()).manifest().get("version"));UUID p=restores.preview(saved.bytes(),admin).preparationId();restores.preRestoreBackup(p,admin);restores.confirmPreRestoreBackup(p,admin);restores.restore(p,saved.bytes(),"RESTAURAR",admin);same("100",service.detail(branch,owner).balances().stockWeight());same("800",service.detail(branch,owner).balances().cash());BranchIntegrity.validate(db);}
 @Test void rejectsPrivilegeEscalationAndSpendingReservedProfit(){
  assertThrows(Problem.class,()->cash("CAPITAL","100",null,owner));
  assertThrows(Problem.class,()->service.create("No autorizado",owner));
  cash("CAPITAL","100",null,admin);UUID lot=buy("A","100","100");sell(lot,"100","200");
  assertThrows(Problem.class,()->cash("EXPENSE","100.01",null,owner));
  assertThrows(Problem.class,()->cash("ADVANCE_RETURN","1",null,owner));
  assertThrows(Problem.class,()->cash("ADMIN_PROFIT","50.01",null,owner));
  same("200",service.detail(branch,owner).balances().cash());BranchIntegrity.validate(db);
 }
 @Test void mixtureCanBeVoidedWithAnIdempotentRequestAndNoMoneyMovement(){
  cash("CAPITAL","500",null,admin);UUID a=buy("A","100","200"),b=buy("B","100","200");
  UUID mixed=service.mix(branch,new MixInput(UUID.randomUUID(),"Mezcla",List.of(new Part(a,n("50")),new Part(b,n("50"))),""),owner);
  var reversal=new ReverseInput(UUID.randomUUID(),"MIX",mixed,"Separar mezcla");
  assertEquals(service.reverse(branch,reversal,admin),service.reverse(branch,reversal,admin));
  same("200",service.detail(branch,owner).balances().stockWeight());same("400",service.detail(branch,owner).balances().stockCost());same("100",service.detail(branch,owner).balances().cash());BranchIntegrity.validate(db);
 }
 @Test void reportsUseBolivianDatesAndExcludeVoidedSales(){
  cash("CAPITAL","500",null,admin);UUID lot=buy("A","100","200"),sale=sell(lot,"10","50");
  db.update("UPDATE branch_sale SET recorded_at='2026-11-21T02:00:00Z' WHERE id=?",sale);
  var report=service.report(branch,"2026-11-20","2026-11-20",admin);assertEquals(1,report.quantity());same("50",report.revenue());
  assertEquals(0,service.report(branch,"2026-11-21","2026-11-21",admin).quantity());
  service.reverse(branch,new ReverseInput(UUID.randomUUID(),"SALE",sale,"Corregir"),admin);
  assertEquals(0,service.report(branch,"2026-11-20","2026-11-20",admin).quantity());
 }
 @Test void oldVersionSixBackupsRemainReadable() throws Exception {
  var mapper=new ObjectMapper();var saved=backups.snapshot();
  // A v6 manifest enumerates precisely the old tables; branch rows and counts did not exist.
  var original=RestoreCsv.parse(saved.bytes(),mapper);
  var oldRows=new LinkedHashMap<>(original.rows());
  var oldUsers=new ArrayList<RestoreCsv.Row>();
  for(var row:original.rows().get("app_user")){
   var values=new LinkedHashMap<>(row.values());values.remove("deleted_at");
   oldUsers.add(new RestoreCsv.Row(row.id(),mapper.writeValueAsString(values),values));
  }
  oldRows.put("app_user",oldUsers);
  var parsed=new RestoreCsv.Parsed(original.sha256(),oldRows,original.manifest());var counts=new LinkedHashMap<String,Integer>();
  for(String table:BackupService.sourceTablesV6())counts.put(table,parsed.rows().get(table).size());
  var manifest=new LinkedHashMap<String,Object>(parsed.manifest());manifest.put("version",6);manifest.put("counts",counts);
  var digest=java.security.MessageDigest.getInstance("SHA-256");
  for(String table:BackupService.sourceTablesV6())if(!table.equals("backup_settings"))for(var row:parsed.rows().get(table)){
   digest.update(table.getBytes(java.nio.charset.StandardCharsets.UTF_8));digest.update((byte)0);
   digest.update(row.id().getBytes(java.nio.charset.StandardCharsets.UTF_8));digest.update((byte)0);
   digest.update(row.data().getBytes(java.nio.charset.StandardCharsets.UTF_8));digest.update((byte)'\n');
  }
  digest.update("backup_settings\0".getBytes(java.nio.charset.StandardCharsets.UTF_8));digest.update("1\0".getBytes(java.nio.charset.StandardCharsets.UTF_8));
  digest.update("7\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));manifest.put("stateDigest",HexFormat.of().formatHex(digest.digest()));
  StringBuilder csv=new StringBuilder("\uFEFFTipo de registro;Identificador;Datos completos JSON\r\n");
  csv.append(csvRow("manifest","backup",mapper.writeValueAsString(manifest)));
  for(String table:BackupService.sourceTablesV6())for(var row:parsed.rows().get(table))csv.append(csvRow(table,row.id(),row.data()));
  var legacy=RestoreCsv.parse(csv.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8),mapper);
  assertEquals(6,legacy.manifest().get("version"));assertEquals(0,legacy.counts().get("branch"));
  restores.preview(csv.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8),admin);
  assertEquals(branch,service.detail(branch,admin).branch().id());
 }
 String csvRow(String a,String b,String c){return "\""+a.replace("\"","\"\"")+"\";\""+b.replace("\"","\"\"")+"\";\""+c.replace("\"","\"\"")+"\"\r\n";}

 @Test void employeePasswordsAreChosenByAdminAndDeletionRevokesAccessWithoutErasingHistory(){
  var employees=context.getBean(EmployeeService.class);var accounts=context.getBean(AccountRepository.class);var passwords=context.getBean(PasswordEncoder.class);
  var data=new EmployeeService.EmployeeData("ana","Ana","123",java.time.LocalDate.of(1990,1,1),"789");
  UUID id=employees.create(data,"1",admin).employee().id();
  assertTrue(passwords.matches("1",accounts.findById(id).orElseThrow().passwordHash()));
  long version=accounts.findById(id).orElseThrow().sessionVersion();
  session(id);employees.resetPassword(id,"2","Nueva contraseña elegida",admin);noSessions(id);
  var user=accounts.findById(id).orElseThrow();
  assertTrue(passwords.matches("2",user.passwordHash()));assertFalse(user.mustChangePassword());assertTrue(user.sessionVersion()>version);
  assertThrows(EmployeeService.EmployeeProblem.class,()->employees.resetPassword(id," ","Inválida",admin));
  session(id);employees.delete(id,"Cambio de personal",admin);noSessions(id);
  assertTrue(employees.list().isEmpty());assertTrue(accounts.findById(id).isEmpty());
  assertTrue(accounts.findByNormalizedUsernameForUpdate("ana").isEmpty());
  assertEquals(false,db.queryForObject("SELECT active FROM app_user WHERE id=?",Boolean.class,id));
  assertEquals(3,db.queryForObject("SELECT count(*) FROM app_user_history WHERE user_id=?",Integer.class,id));
  assertThrows(EmployeeService.EmployeeProblem.class,()->employees.setActive(id,true,"Reactivar",admin));
  assertThrows(EmployeeService.EmployeeProblem.class,()->employees.resetPassword(id,"3","Restablecer",admin));
 }

 @Test void deletingOwnerPreservesMoneyAndHistoryAndDoesNotReviveOnRestore(){
  cash("CAPITAL","500",null,admin);UUID lot=buy("A","100","200");sell(lot,"100","300");
  service.resetOwner(owner,new OwnerPassword("7","Nueva clave"),admin);
  var accounts=context.getBean(AccountRepository.class);
  assertTrue(context.getBean(PasswordEncoder.class).matches("7",accounts.findById(owner).orElseThrow().passwordHash()));
  assertFalse(accounts.findById(owner).orElseThrow().mustChangePassword());
  var before=backups.snapshot();
  session(owner);service.deleteOwner(owner,"Cambio de dueño",admin);noSessions(owner);
  assertTrue(service.owners(admin).isEmpty());assertNull(service.detail(branch,admin).branch().ownerId());
  assertTrue(accounts.findById(owner).isEmpty());same("50",service.detail(branch,admin).balances().ownerDue());
  assertThrows(Problem.class,()->service.detail(branch,owner));
  assertThrows(Problem.class,()->service.assign(branch,new Assign(owner,"Intento"),admin));
  UUID p=restores.preview(before.bytes(),admin).preparationId();restores.preRestoreBackup(p,admin);restores.confirmPreRestoreBackup(p,admin);
  restores.restore(p,before.bytes(),"RESTAURAR",admin);
  assertTrue(accounts.findById(owner).isEmpty());assertTrue(service.owners(admin).isEmpty());
  assertNull(service.detail(branch,admin).branch().ownerId());same("50",service.detail(branch,admin).balances().ownerDue());
  cash("OWNER_WITHDRAWAL","50",owner,admin);same("0",service.detail(branch,admin).balances().ownerDue());
  BranchIntegrity.validate(db);
 }

 @Test void ownersCannotReadReportsOrHistoryOrRegisterAdminDeliveries(){
  cash("CAPITAL","1000",null,admin);cash("ADVANCE","100",null,admin);UUID lot=buy("A","100","200");sell(lot,"100","300");
  assertTrue(service.detail(branch,owner).history().isEmpty());assertFalse(service.detail(branch,admin).history().isEmpty());
  assertThrows(Problem.class,()->service.report(branch,null,null,owner));
  assertThrows(Problem.class,()->cash("ADVANCE_RETURN","10",null,owner));
  assertThrows(Problem.class,()->cash("ADMIN_PROFIT","10",null,owner));
  cash("EXPENSE","5",null,owner);cash("OWNER_WITHDRAWAL","10",null,owner);
  var all=service.report(branch,null,null,admin);same("300",all.revenue());same("5",all.expenses());same("10",all.ownerWithdrawals());same("100",all.advances());same("1000",all.capital());
 }

}
