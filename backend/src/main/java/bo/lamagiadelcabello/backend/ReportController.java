package bo.lamagiadelcabello.backend;

import java.time.LocalDate;
import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reports")
class ReportController {

    private final ReportService reports;

    ReportController(ReportService reports) {
        this.reports = reports;
    }

    @GetMapping("/overview")
    ReportService.Overview overview() {
        return reports.overview();
    }

    @GetMapping("/results")
    ReportService.PeriodReport results(@RequestParam(required = false) String period,
                                       @RequestParam(required = false) LocalDate asOf,
                                       @RequestParam(required = false) Integer count) {
        return reports.results(period, asOf, count);
    }

    @GetMapping("/top-products")
    List<ReportService.TopProduct> topProducts(@RequestParam(required = false) Integer limit) {
        return reports.topProducts(limit);
    }

    @GetMapping("/top-categories")
    List<ReportService.TopCategory> topCategories(@RequestParam(required = false) Integer limit) {
        return reports.topCategories(limit);
    }
}
