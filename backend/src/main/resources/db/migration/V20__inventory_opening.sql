CREATE TABLE inventory_opening (
    id UUID PRIMARY KEY,
    singleton BOOLEAN NOT NULL DEFAULT TRUE UNIQUE CHECK (singleton),
    cutoff_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0,
    actor_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT
);

ALTER TABLE stock_lot ALTER COLUMN receipt_line_id DROP NOT NULL;
ALTER TABLE stock_lot ADD COLUMN opening_id UUID REFERENCES inventory_opening(id) ON DELETE RESTRICT;
ALTER TABLE stock_lot ADD COLUMN opening_order INTEGER;
ALTER TABLE stock_lot ADD COLUMN origin_date DATE;
ALTER TABLE stock_lot ADD COLUMN cost_estimated BOOLEAN;
ALTER TABLE stock_lot ADD COLUMN opening_note VARCHAR(300);
ALTER TABLE stock_lot ADD CONSTRAINT stock_lot_one_source CHECK (
    (receipt_line_id IS NOT NULL AND opening_id IS NULL AND opening_order IS NULL
        AND origin_date IS NULL AND cost_estimated IS NULL AND opening_note IS NULL)
    OR
    (receipt_line_id IS NULL AND opening_id IS NOT NULL AND opening_order IS NOT NULL
        AND opening_order > 0
        AND cost_estimated IS NOT NULL)
);
ALTER TABLE stock_lot ADD CONSTRAINT stock_lot_opening_order_unique
    UNIQUE (opening_id, opening_order) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE inventory_opening_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opening_id UUID NOT NULL REFERENCES inventory_opening(id) ON DELETE RESTRICT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
    reason VARCHAR(500),
    old_values JSONB,
    new_values JSONB
);

CREATE INDEX inventory_opening_history_time
    ON inventory_opening_history (opening_id, changed_at DESC, id DESC);

CREATE OR REPLACE VIEW active_stock_lot_value AS
WITH purchase_progress AS (
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
FROM purchase_progress
UNION ALL
SELECT sl.id AS stock_lot_id,
       ROUND(sl.original_weight * sl.cost_per_gram, 2) AS purchase_value
FROM stock_lot sl
WHERE sl.opening_id IS NOT NULL AND sl.voided_at IS NULL;
