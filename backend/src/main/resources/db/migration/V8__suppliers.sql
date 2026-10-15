CREATE TABLE supplier (
    id UUID PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    city VARCHAR(100) NOT NULL DEFAULT '',
    address VARCHAR(250) NOT NULL DEFAULT '',
    maps_url VARCHAR(1000) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    modified_at TIMESTAMPTZ,
    CONSTRAINT supplier_name_required CHECK (length(trim(name)) > 0),
    CONSTRAINT supplier_phone_required CHECK (length(trim(phone)) > 0)
);

CREATE UNIQUE INDEX supplier_name_normalized_unique ON supplier (lower(trim(name)));

-- El historial conserva también la eliminación de proveedores que no tienen referencias.
CREATE TABLE supplier_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_id UUID NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type VARCHAR(30) NOT NULL,
    actor_user_id UUID NOT NULL REFERENCES app_user(id),
    reason VARCHAR(500),
    old_values JSONB,
    new_values JSONB
);

CREATE INDEX supplier_history_supplier_time
    ON supplier_history (supplier_id, changed_at DESC, id DESC);
