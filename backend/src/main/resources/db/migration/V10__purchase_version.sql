ALTER TABLE purchase_order
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT purchase_order_version_valid CHECK (version >= 0);
