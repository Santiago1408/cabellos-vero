package bo.lamagiadelcabello.backend;

import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.http.HttpStatus;

final class BranchMath {
    static final BigDecimal ZERO = new BigDecimal("0.00");
    static BigDecimal positive(BigDecimal value, String label) {
        if (value == null || value.signum() <= 0 || value.scale() > 2 || value.precision() - value.scale() > 12)
            throw new BranchService.Problem(HttpStatus.BAD_REQUEST, "Indica " + label + " positivo, con hasta dos decimales.");
        return value.setScale(2);
    }
    static BigDecimal portion(BigDecimal remainingCost, BigDecimal remainingWeight, BigDecimal weight) {
        if (weight.signum() <= 0 || weight.compareTo(remainingWeight) > 0)
            throw new BranchService.Problem(HttpStatus.CONFLICT, "El peso solicitado supera el disponible.");
        return weight.compareTo(remainingWeight) == 0 ? remainingCost
            : remainingCost.multiply(weight).divide(remainingWeight, 2, RoundingMode.HALF_UP);
    }
    static BigDecimal adminShare(BigDecimal profit) { return profit.divide(new BigDecimal("2"), 2, RoundingMode.DOWN); }
}
