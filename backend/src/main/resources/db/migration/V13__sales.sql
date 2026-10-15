CREATE TABLE sale_order (
    id UUID PRIMARY KEY,
    request_key UUID NOT NULL UNIQUE,
    request_hash CHAR(64) NOT NULL,
    customer_name VARCHAR(200) NOT NULL,
    operation_date DATE NOT NULL,
    accepted_pending_stock BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT sale_order_name_nonempty CHECK (length(trim(customer_name)) > 0),
    CONSTRAINT sale_order_status_valid CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELED')),
    CONSTRAINT sale_order_version_valid CHECK (version >= 0)
);

CREATE INDEX sale_order_date ON sale_order (operation_date DESC, created_at DESC, id DESC);

CREATE TABLE sale_line (
    id UUID PRIMARY KEY,
    sale_id UUID NOT NULL REFERENCES sale_order(id) ON DELETE RESTRICT,
    category_code VARCHAR(40) NOT NULL REFERENCES hair_category(code) ON DELETE RESTRICT,
    length_cm INTEGER NOT NULL REFERENCES hair_length(centimeters) ON DELETE RESTRICT,
    agreed_weight NUMERIC(14, 2) NOT NULL,
    price_per_gram NUMERIC(14, 2) NOT NULL,
    CONSTRAINT sale_line_weight_positive CHECK (agreed_weight > 0),
    CONSTRAINT sale_line_price_positive CHECK (price_per_gram > 0),
    CONSTRAINT sale_line_sale_id_unique UNIQUE (id, sale_id)
);

CREATE INDEX sale_line_type ON sale_line (category_code, length_cm);
CREATE INDEX sale_line_sale ON sale_line (sale_id);

CREATE TABLE sale_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id UUID NOT NULL REFERENCES sale_order(id) ON DELETE RESTRICT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type VARCHAR(40) NOT NULL,
    actor_user_id UUID NOT NULL REFERENCES app_user(id),
    reason VARCHAR(500),
    old_values JSONB,
    new_values JSONB
);

CREATE INDEX sale_history_sale_time
    ON sale_history (sale_id, changed_at DESC, id DESC);
