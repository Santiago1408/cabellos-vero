CREATE VIEW active_stock_lot_value AS
WITH progress AS (
    SELECT sl.id AS stock_lot_id, sl.original_weight, sl.cost_per_gram,
           SUM(sl.original_weight) OVER (
               PARTITION BY rl.purchase_line_id
               ORDER BY sl.effective_at, sl.created_at, sl.id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS cumulative_weight
    FROM stock_lot sl
    JOIN purchase_receipt_line rl ON rl.id = sl.receipt_line_id
    JOIN purchase_receipt pr ON pr.id = rl.receipt_id
    WHERE sl.voided_at IS NULL AND pr.voided_at IS NULL
)
SELECT stock_lot_id,
       ROUND(cumulative_weight * cost_per_gram, 2)
       - ROUND((cumulative_weight - original_weight) * cost_per_gram, 2)
           AS purchase_value
FROM progress;

CREATE VIEW active_sale_delivery_line_value AS
WITH progress AS (
    SELECT dl.id AS delivery_line_id, dl.weight, l.price_per_gram,
           SUM(dl.weight) OVER (
               PARTITION BY dl.sale_line_id
               ORDER BY sd.effective_at, sd.recorded_at, sd.id, dl.id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS cumulative_weight
    FROM sale_delivery_line dl
    JOIN sale_delivery sd ON sd.id = dl.delivery_id
    JOIN sale_line l ON l.id = dl.sale_line_id
    WHERE sd.voided_at IS NULL
)
SELECT delivery_line_id,
       ROUND(cumulative_weight * price_per_gram, 2)
       - ROUND((cumulative_weight - weight) * price_per_gram, 2)
           AS revenue_value
FROM progress;
