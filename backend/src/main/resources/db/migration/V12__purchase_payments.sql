CREATE TABLE purchase_payment (
    id UUID PRIMARY KEY,
    purchase_id UUID NOT NULL REFERENCES purchase_order(id) ON DELETE RESTRICT,
    request_key UUID NOT NULL UNIQUE,
    request_hash CHAR(64) NOT NULL,
    payment_date DATE NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    method VARCHAR(20) NOT NULL,
    reference VARCHAR(200),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    voided_at TIMESTAMPTZ,
    CONSTRAINT purchase_payment_amount_positive CHECK (amount > 0),
    CONSTRAINT purchase_payment_method_valid CHECK (method IN ('CASH', 'QR', 'TRANSFER', 'OTHER'))
);

CREATE INDEX purchase_payment_purchase_date
    ON purchase_payment (purchase_id, payment_date, recorded_at, id);
