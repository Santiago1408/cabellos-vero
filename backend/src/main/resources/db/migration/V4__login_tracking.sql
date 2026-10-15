ALTER TABLE app_user
    ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN next_login_at TIMESTAMPTZ,
    ADD COLUMN last_login_at TIMESTAMPTZ,
    ADD CONSTRAINT app_user_failed_login_count_valid CHECK (failed_login_count >= 0);
