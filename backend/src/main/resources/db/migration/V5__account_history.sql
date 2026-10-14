ALTER TABLE app_user
    ADD COLUMN session_version BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT app_user_session_version_valid CHECK (session_version >= 0);

CREATE TABLE app_user_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_user(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type VARCHAR(40) NOT NULL,
    source VARCHAR(30) NOT NULL,
    actor_user_id UUID REFERENCES app_user(id),
    old_values JSONB,
    new_values JSONB
);

CREATE INDEX app_user_history_user_time ON app_user_history (user_id, changed_at DESC, id DESC);

INSERT INTO app_user_history (user_id, changed_at, event_type, source, new_values)
SELECT id, created_at, 'ACCOUNT_CREATED', 'MIGRATION',
       jsonb_build_object('username', username, 'role', role)
FROM app_user;
