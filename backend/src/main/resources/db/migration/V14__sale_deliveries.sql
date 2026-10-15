CREATE TABLE sale_delivery (
    id UUID PRIMARY KEY,
    sale_id UUID NOT NULL REFERENCES sale_order(id) ON DELETE RESTRICT,
    request_key UUID NOT NULL UNIQUE,
    request_hash CHAR(64) NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    voided_at TIMESTAMPTZ,
    CONSTRAINT sale_delivery_id_sale_unique UNIQUE (id, sale_id)
);

CREATE INDEX sale_delivery_sale_time ON sale_delivery (sale_id, effective_at, id);

CREATE TABLE sale_delivery_line (
    id UUID PRIMARY KEY,
    delivery_id UUID NOT NULL,
    sale_id UUID NOT NULL,
    sale_line_id UUID NOT NULL,
    weight NUMERIC(14, 2) NOT NULL,
    CONSTRAINT sale_delivery_line_weight_positive CHECK (weight > 0),
    CONSTRAINT sale_delivery_line_delivery_unique UNIQUE (delivery_id, sale_line_id),
    CONSTRAINT sale_delivery_line_delivery_fk FOREIGN KEY (delivery_id, sale_id)
        REFERENCES sale_delivery(id, sale_id) ON DELETE RESTRICT,
    CONSTRAINT sale_delivery_line_sale_line_fk FOREIGN KEY (sale_line_id, sale_id)
        REFERENCES sale_line(id, sale_id) ON DELETE RESTRICT
);

CREATE INDEX sale_delivery_line_sale_line ON sale_delivery_line (sale_line_id);

CREATE TABLE stock_consumption (
    id UUID PRIMARY KEY,
    delivery_line_id UUID NOT NULL REFERENCES sale_delivery_line(id) ON DELETE RESTRICT,
    stock_lot_id UUID NOT NULL REFERENCES stock_lot(id) ON DELETE RESTRICT,
    weight NUMERIC(14, 2) NOT NULL,
    CONSTRAINT stock_consumption_weight_positive CHECK (weight > 0),
    CONSTRAINT stock_consumption_pair_unique UNIQUE (delivery_line_id, stock_lot_id)
);

CREATE INDEX stock_consumption_lot ON stock_consumption (stock_lot_id);
