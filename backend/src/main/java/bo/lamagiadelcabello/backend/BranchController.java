package bo.lamagiadelcabello.backend;

import java.util.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import bo.lamagiadelcabello.backend.BranchService.*;

@RestController
class BranchController {
    private final BranchService branches;
    BranchController(BranchService branches){this.branches=branches;}
    private UUID actor(Authentication auth){return ((AccountPrincipal)auth.getPrincipal()).id();}
    @GetMapping("/api/branches") List<Overview> list(Authentication auth){return branches.list(actor(auth));}
    @PostMapping("/api/branches") Map<String,UUID> create(@RequestBody Name input,Authentication auth){return result(branches.create(input.name(),actor(auth)));}
    @PutMapping("/api/branches/{id}") void edit(@PathVariable UUID id,@RequestBody BranchEdit input,Authentication auth){branches.edit(id,input,actor(auth));}
    @PostMapping("/api/branches/{id}/owner") void assign(@PathVariable UUID id,@RequestBody Assign input,Authentication auth){branches.assign(id,input,actor(auth));}
    @GetMapping("/api/branch-owners") List<Owner> owners(Authentication auth){return branches.owners(actor(auth));}
    @PostMapping("/api/branch-owners") Map<String,UUID> createOwner(@RequestBody OwnerInput input,Authentication auth){return result(branches.createOwner(input,actor(auth)));}
    @PutMapping("/api/branch-owners/{id}") void editOwner(@PathVariable UUID id,@RequestBody OwnerEdit input,Authentication auth){branches.editOwner(id,input,actor(auth));}
    @PostMapping("/api/branch-owners/{id}/password") void resetOwner(@PathVariable UUID id,@RequestBody OwnerPassword input,Authentication auth){branches.resetOwner(id,input,actor(auth));}
    @PostMapping("/api/branch-owners/{id}/delete") void deleteOwner(@PathVariable UUID id,@RequestBody DeleteInput input,Authentication auth){branches.deleteOwner(id,input.reason(),actor(auth));}
    record DeleteInput(String reason){}
    @GetMapping("/api/branches/{id}") Detail detail(@PathVariable UUID id,Authentication auth){return branches.detail(id,actor(auth));}
    @GetMapping("/api/branches/{id}/sales") List<SaleView> sales(@PathVariable UUID id,@RequestParam(defaultValue="0") int offset,Authentication auth){return branches.sales(id,offset,actor(auth));}
    @PostMapping("/api/branches/{id}/purchases") Map<String,UUID> purchase(@PathVariable UUID id,@RequestBody PurchaseInput input,Authentication auth){return result(branches.purchase(id,input,actor(auth)));}
    @PostMapping("/api/branches/{id}/sales") Map<String,UUID> sale(@PathVariable UUID id,@RequestBody SaleInput input,Authentication auth){return result(branches.sell(id,input,actor(auth)));}
    @PostMapping("/api/branches/{id}/mixes") Map<String,UUID> mix(@PathVariable UUID id,@RequestBody MixInput input,Authentication auth){return result(branches.mix(id,input,actor(auth)));}
    @PostMapping("/api/branches/{id}/cash") Map<String,UUID> cash(@PathVariable UUID id,@RequestBody CashInput input,Authentication auth){return result(branches.cash(id,input,actor(auth)));}
    @PostMapping("/api/branches/{id}/reverse") Map<String,UUID> reverse(@PathVariable UUID id,@RequestBody ReverseInput input,Authentication auth){return result(branches.reverse(id,input,actor(auth)));}
    @GetMapping("/api/branches/{id}/report") Report report(@PathVariable UUID id,@RequestParam(required=false) String from,@RequestParam(required=false) String to,Authentication auth){return branches.report(id,from,to,actor(auth));}
    @ExceptionHandler(Problem.class) ResponseEntity<Map<String,String>> problem(Problem error){return ResponseEntity.status(error.status).body(Map.of("error",error.getMessage()));}
    @ExceptionHandler(DataIntegrityViolationException.class) ResponseEntity<Map<String,String>> conflict(DataIntegrityViolationException error){return ResponseEntity.status(409).body(Map.of("error","El usuario, la asignación o la solicitud ya existe, o hay una relación incompatible. Actualiza el detalle antes de continuar."));}
    private Map<String,UUID> result(UUID id){return Map.of("id",id);}
    record Name(String name){}
}
