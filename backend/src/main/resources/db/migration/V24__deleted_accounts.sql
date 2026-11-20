ALTER TABLE app_user ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE app_user ADD CONSTRAINT deleted_account_inactive CHECK(deleted_at IS NULL OR (active=FALSE AND role<>'ADMIN'));
