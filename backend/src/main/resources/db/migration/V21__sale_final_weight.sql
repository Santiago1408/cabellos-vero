ALTER TABLE sale_line
    ADD COLUMN final_weight NUMERIC(14, 2);
UPDATE sale_line SET final_weight = agreed_weight;
ALTER TABLE sale_line
    ALTER COLUMN final_weight SET NOT NULL,
    ADD CONSTRAINT sale_line_final_weight_valid CHECK (final_weight >= agreed_weight);

ALTER TABLE sale_delivery_line
    ADD COLUMN final_weight NUMERIC(14, 2);
UPDATE sale_delivery_line SET final_weight = weight;
ALTER TABLE sale_delivery_line
    ALTER COLUMN final_weight SET NOT NULL,
    ADD CONSTRAINT sale_delivery_final_weight_valid CHECK (final_weight >= weight);

CREATE OR REPLACE VIEW active_sale_delivery_line_value AS
WITH progress AS (
    SELECT dl.id AS delivery_line_id, dl.final_weight, l.price_per_gram,
           SUM(dl.final_weight) OVER (
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
       - ROUND((cumulative_weight - final_weight) * price_per_gram, 2)
           AS revenue_value
FROM progress;
