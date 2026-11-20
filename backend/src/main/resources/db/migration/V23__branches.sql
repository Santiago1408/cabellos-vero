ALTER TABLE app_user DROP CONSTRAINT app_user_role_valid;
ALTER TABLE app_user ADD CONSTRAINT app_user_role_valid CHECK (role IN ('ADMIN','EMPLOYEE','BRANCH_OWNER'));

CREATE TABLE branch (
 id UUID PRIMARY KEY, name VARCHAR(160) NOT NULL CHECK (length(trim(name)) > 0),
 active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE branch_assignment (
 id UUID PRIMARY KEY, branch_id UUID NOT NULL REFERENCES branch(id),
 user_id UUID NOT NULL REFERENCES app_user(id), assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ,
 CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);
CREATE UNIQUE INDEX branch_one_owner ON branch_assignment(branch_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX owner_one_branch ON branch_assignment(user_id) WHERE ended_at IS NULL;

CREATE TABLE branch_lot (
 id UUID PRIMARY KEY, branch_id UUID NOT NULL REFERENCES branch(id),
 kind VARCHAR(20) NOT NULL CHECK (kind IN ('PURCHASE','MIX')),
 label VARCHAR(160) NOT NULL CHECK (length(trim(label)) > 0), seller VARCHAR(160) NOT NULL DEFAULT '',
 original_weight NUMERIC(14,2) NOT NULL CHECK (original_weight > 0),
 remaining_weight NUMERIC(14,2) NOT NULL CHECK (remaining_weight >= 0 AND remaining_weight <= original_weight),
 original_cost NUMERIC(14,2) NOT NULL CHECK (original_cost >= 0 AND (kind='MIX' OR original_cost > 0)),
 remaining_cost NUMERIC(14,2) NOT NULL CHECK (remaining_cost >= 0 AND remaining_cost <= original_cost),
 note VARCHAR(500) NOT NULL DEFAULT '', actor_user_id UUID NOT NULL REFERENCES app_user(id),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(), voided_at TIMESTAMPTZ,
 void_request_key UUID, void_request_hash CHAR(64),
 request_key UUID NOT NULL, request_hash CHAR(64) NOT NULL,
 UNIQUE(branch_id,request_key), UNIQUE(id,branch_id),
 CHECK ((remaining_weight = 0 AND remaining_cost = 0) OR remaining_weight > 0)
);
CREATE TABLE branch_sale (
 id UUID PRIMARY KEY, branch_id UUID NOT NULL REFERENCES branch(id), owner_user_id UUID NOT NULL REFERENCES app_user(id),
 customer VARCHAR(160) NOT NULL DEFAULT '', weight NUMERIC(14,2) NOT NULL CHECK(weight > 0),
 amount NUMERIC(14,2) NOT NULL CHECK(amount > 0), cost NUMERIC(14,2) NOT NULL CHECK(cost >= 0 AND amount >= cost),
 admin_share NUMERIC(14,2) NOT NULL CHECK(admin_share >= 0), owner_share NUMERIC(14,2) NOT NULL CHECK(owner_share >= 0),
 method VARCHAR(20) NOT NULL CHECK(method IN ('CASH','QR','TRANSFER','OTHER')),
 note VARCHAR(500) NOT NULL DEFAULT '', recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 actor_user_id UUID NOT NULL REFERENCES app_user(id), voided_at TIMESTAMPTZ,
 request_key UUID NOT NULL, request_hash CHAR(64) NOT NULL,
 UNIQUE(branch_id,request_key), UNIQUE(id,branch_id), CHECK(admin_share + owner_share = amount - cost)
);
CREATE TABLE branch_sale_item (
 id UUID PRIMARY KEY, branch_id UUID NOT NULL REFERENCES branch(id), sale_id UUID NOT NULL, lot_id UUID NOT NULL,
 weight NUMERIC(14,2) NOT NULL CHECK(weight > 0), cost NUMERIC(14,2) NOT NULL CHECK(cost >= 0),
 FOREIGN KEY(sale_id,branch_id) REFERENCES branch_sale(id,branch_id),
 FOREIGN KEY(lot_id,branch_id) REFERENCES branch_lot(id,branch_id), UNIQUE(sale_id,lot_id)
);
CREATE TABLE branch_mix_item (
 id UUID PRIMARY KEY, branch_id UUID NOT NULL REFERENCES branch(id), mix_lot_id UUID NOT NULL, source_lot_id UUID NOT NULL,
 weight NUMERIC(14,2) NOT NULL CHECK(weight > 0), cost NUMERIC(14,2) NOT NULL CHECK(cost >= 0),
 FOREIGN KEY(mix_lot_id,branch_id) REFERENCES branch_lot(id,branch_id),
 FOREIGN KEY(source_lot_id,branch_id) REFERENCES branch_lot(id,branch_id),
 UNIQUE(mix_lot_id,source_lot_id), CHECK(mix_lot_id <> source_lot_id)
);
CREATE TABLE branch_cash_entry (
 id UUID PRIMARY KEY, branch_id UUID NOT NULL REFERENCES branch(id),
 kind VARCHAR(30) NOT NULL CHECK(kind IN ('CAPITAL','ADVANCE','EXPENSE','ADVANCE_RETURN','ADMIN_PROFIT','OWNER_WITHDRAWAL','PURCHASE','SALE','REVERSAL')),
 cash_delta NUMERIC(14,2) NOT NULL, capital_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
 advance_delta NUMERIC(14,2) NOT NULL DEFAULT 0, admin_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
 owner_delta NUMERIC(14,2) NOT NULL DEFAULT 0, owner_user_id UUID REFERENCES app_user(id),
 note VARCHAR(500) NOT NULL CHECK(length(trim(note)) > 0),
 actor_user_id UUID NOT NULL REFERENCES app_user(id), recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 reference_id UUID, reversal_of UUID UNIQUE REFERENCES branch_cash_entry(id) DEFERRABLE INITIALLY IMMEDIATE,
 confirmed_at TIMESTAMPTZ, confirmed_by UUID REFERENCES app_user(id),
 request_key UUID NOT NULL, request_hash CHAR(64) NOT NULL, UNIQUE(branch_id,request_key),
 CHECK(owner_delta = 0 OR owner_user_id IS NOT NULL)
);
CREATE TABLE branch_history (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, branch_id UUID NOT NULL REFERENCES branch(id),
 actor_user_id UUID NOT NULL REFERENCES app_user(id), recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 event_type VARCHAR(40) NOT NULL, reason VARCHAR(500), old_values JSONB, new_values JSONB
);
CREATE INDEX branch_lots_time ON branch_lot(branch_id,recorded_at DESC);
CREATE INDEX branch_sales_time ON branch_sale(branch_id,recorded_at DESC);
CREATE INDEX branch_cash_time ON branch_cash_entry(branch_id,recorded_at DESC);
CREATE INDEX branch_history_time ON branch_history(branch_id,recorded_at DESC);

ALTER TABLE branch_cash_entry ADD CONSTRAINT branch_cash_shape CHECK (
 (kind='CAPITAL' AND cash_delta>0 AND capital_delta=cash_delta AND advance_delta=0 AND admin_delta=0 AND owner_delta=0) OR
 (kind='ADVANCE' AND cash_delta>0 AND capital_delta=0 AND advance_delta=cash_delta AND admin_delta=0 AND owner_delta=0) OR
 (kind='EXPENSE' AND cash_delta<0 AND capital_delta=0 AND advance_delta=0 AND admin_delta=0 AND owner_delta=0) OR
 (kind='ADVANCE_RETURN' AND cash_delta<0 AND capital_delta=0 AND advance_delta=cash_delta AND admin_delta=0 AND owner_delta=0) OR
 (kind='ADMIN_PROFIT' AND cash_delta<0 AND capital_delta=0 AND advance_delta=0 AND admin_delta=cash_delta AND owner_delta=0) OR
 (kind='OWNER_WITHDRAWAL' AND cash_delta<0 AND capital_delta=0 AND advance_delta=0 AND admin_delta=0 AND owner_delta=cash_delta) OR
 (kind='PURCHASE' AND cash_delta<0 AND capital_delta=0 AND advance_delta=0 AND admin_delta=0 AND owner_delta=0 AND reference_id IS NOT NULL) OR
 (kind='SALE' AND cash_delta>0 AND capital_delta=0 AND advance_delta=0 AND admin_delta>=0 AND owner_delta>=0 AND admin_delta+owner_delta<=cash_delta AND reference_id IS NOT NULL) OR
 (kind='REVERSAL' AND reversal_of IS NOT NULL)
);

CREATE UNIQUE INDEX branch_lot_void_request ON branch_lot(branch_id,void_request_key) WHERE void_request_key IS NOT NULL;
