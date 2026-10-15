-- Deudas de efectivo ajenas a las operaciones de cabello.
CREATE TABLE cash_debt (
    id UUID PRIMARY KEY,
    request_key UUID NOT NULL UNIQUE,
    request_hash CHAR(64) NOT NULL,
    party VARCHAR(160) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    kind VARCHAR(20) NOT NULL,
    total NUMERIC(14, 2) NOT NULL,
    opened_on DATE NOT NULL,
    due_on DATE NOT NULL,
    notes VARCHAR(2000) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT cash_debt_party_required CHECK (length(trim(party)) > 0),
    CONSTRAINT cash_debt_phone_required CHECK (length(trim(phone)) > 0),
    CONSTRAINT cash_debt_kind_valid CHECK (kind IN ('RECEIVABLE', 'PAYABLE')),
    CONSTRAINT cash_debt_total_positive CHECK (total > 0),
    CONSTRAINT cash_debt_dates_valid CHECK (due_on >= opened_on)
);

CREATE INDEX cash_debt_due_on ON cash_debt (due_on, id);

CREATE TABLE cash_debt_payment (
    id UUID PRIMARY KEY,
    debt_id UUID NOT NULL REFERENCES cash_debt(id) ON DELETE RESTRICT,
    request_key UUID NOT NULL UNIQUE,
    request_hash CHAR(64) NOT NULL,
    paid_on DATE NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    note VARCHAR(1000) NOT NULL DEFAULT '',
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    voided_at TIMESTAMPTZ,
    CONSTRAINT cash_debt_payment_positive CHECK (amount > 0)
);

CREATE INDEX cash_debt_payment_debt_time
    ON cash_debt_payment (debt_id, paid_on DESC, recorded_at DESC, id);

CREATE TABLE cash_debt_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    debt_id UUID NOT NULL REFERENCES cash_debt(id) ON DELETE RESTRICT,
    payment_id UUID REFERENCES cash_debt_payment(id) ON DELETE RESTRICT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type VARCHAR(40) NOT NULL,
    actor_user_id UUID NOT NULL REFERENCES app_user(id),
    reason VARCHAR(500),
    old_values JSONB,
    new_values JSONB
);

CREATE INDEX cash_debt_history_debt_time
    ON cash_debt_history (debt_id, changed_at DESC, id DESC);
