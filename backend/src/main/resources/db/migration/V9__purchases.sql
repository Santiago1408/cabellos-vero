CREATE TABLE purchase_order (
    id UUID PRIMARY KEY,
    request_key UUID NOT NULL UNIQUE,
    request_hash CHAR(64) NOT NULL,
    supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE RESTRICT,
    operation_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT purchase_order_status_valid CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELED'))
);

CREATE INDEX purchase_order_date ON purchase_order (operation_date DESC, created_at DESC, id DESC);
CREATE INDEX purchase_order_supplier ON purchase_order (supplier_id);

CREATE TABLE purchase_line (
    id UUID PRIMARY KEY,
    purchase_id UUID NOT NULL REFERENCES purchase_order(id) ON DELETE RESTRICT,
    category_code VARCHAR(40) NOT NULL REFERENCES hair_category(code) ON DELETE RESTRICT,
    length_cm INTEGER NOT NULL REFERENCES hair_length(centimeters) ON DELETE RESTRICT,
    agreed_weight NUMERIC(14, 2) NOT NULL,
    price_per_gram NUMERIC(14, 2) NOT NULL,
    CONSTRAINT purchase_line_weight_positive CHECK (agreed_weight > 0),
    CONSTRAINT purchase_line_price_positive CHECK (price_per_gram > 0),
    CONSTRAINT purchase_line_purchase_id_unique UNIQUE (id, purchase_id)
);

CREATE INDEX purchase_line_type ON purchase_line (category_code, length_cm);
CREATE INDEX purchase_line_purchase ON purchase_line (purchase_id);

CREATE TABLE purchase_receipt (
    id UUID PRIMARY KEY,
    purchase_id UUID NOT NULL REFERENCES purchase_order(id) ON DELETE RESTRICT,
    request_key UUID NOT NULL UNIQUE,
    request_hash CHAR(64) NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    voided_at TIMESTAMPTZ,
    CONSTRAINT purchase_receipt_id_purchase_unique UNIQUE (id, purchase_id)
);

CREATE INDEX purchase_receipt_purchase_time ON purchase_receipt (purchase_id, effective_at, id);

CREATE TABLE purchase_receipt_line (
    id UUID PRIMARY KEY,
    receipt_id UUID NOT NULL,
    purchase_id UUID NOT NULL,
    purchase_line_id UUID NOT NULL,
    weight NUMERIC(14, 2) NOT NULL,
    CONSTRAINT purchase_receipt_line_weight_positive CHECK (weight > 0),
    CONSTRAINT purchase_receipt_line_receipt_unique UNIQUE (receipt_id, purchase_line_id),
    CONSTRAINT purchase_receipt_line_receipt_fk FOREIGN KEY (receipt_id, purchase_id)
        REFERENCES purchase_receipt(id, purchase_id) ON DELETE RESTRICT,
    CONSTRAINT purchase_receipt_line_purchase_line_fk FOREIGN KEY (purchase_line_id, purchase_id)
        REFERENCES purchase_line(id, purchase_id) ON DELETE RESTRICT
);

CREATE INDEX purchase_receipt_line_purchase_line ON purchase_receipt_line (purchase_line_id);

CREATE TABLE stock_lot (
    id UUID PRIMARY KEY,
    receipt_line_id UUID NOT NULL UNIQUE REFERENCES purchase_receipt_line(id) ON DELETE RESTRICT,
    category_code VARCHAR(40) NOT NULL REFERENCES hair_category(code) ON DELETE RESTRICT,
    length_cm INTEGER NOT NULL REFERENCES hair_length(centimeters) ON DELETE RESTRICT,
    cost_per_gram NUMERIC(14, 2) NOT NULL,
    original_weight NUMERIC(14, 2) NOT NULL,
    remaining_weight NUMERIC(14, 2) NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stock_lot_cost_positive CHECK (cost_per_gram > 0),
    CONSTRAINT stock_lot_original_positive CHECK (original_weight > 0),
    CONSTRAINT stock_lot_remaining_valid CHECK (remaining_weight >= 0 AND remaining_weight <= original_weight)
);

CREATE INDEX stock_lot_type_fifo
    ON stock_lot (category_code, length_cm, effective_at, created_at, id);

CREATE TABLE purchase_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purchase_id UUID NOT NULL REFERENCES purchase_order(id) ON DELETE RESTRICT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type VARCHAR(40) NOT NULL,
    actor_user_id UUID NOT NULL REFERENCES app_user(id),
    reason VARCHAR(500),
    old_values JSONB,
    new_values JSONB
);

CREATE INDEX purchase_history_purchase_time
    ON purchase_history (purchase_id, changed_at DESC, id DESC);
