-- Preparación efímera para enlazar vista previa, copia previa y confirmación.
CREATE TABLE restore_preparation (
    id UUID PRIMARY KEY,
    actor_user_id UUID NOT NULL,
    file_sha256 CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    prebackup_digest CHAR(64),
    prebackup_downloaded_at TIMESTAMPTZ,
    prebackup_confirmed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX restore_preparation_expiry ON restore_preparation (expires_at);

-- Bitácora técnica independiente del conjunto de datos reemplazado.
CREATE TABLE restore_event (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    preparation_id UUID NOT NULL,
    actor_user_id UUID NOT NULL,
    source_sha256 CHAR(64) NOT NULL,
    previous_digest CHAR(64) NOT NULL,
    restored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    summary JSONB NOT NULL
);
