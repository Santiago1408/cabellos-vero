-- El recordatorio pertenece a la instalación, no al navegador del administrador.
CREATE TABLE backup_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    interval_days INTEGER NOT NULL DEFAULT 7,
    last_confirmed_at TIMESTAMPTZ,
    pending_export_at TIMESTAMPTZ,
    CONSTRAINT backup_settings_singleton CHECK (id = 1),
    CONSTRAINT backup_settings_interval CHECK (interval_days BETWEEN 1 AND 365)
);

INSERT INTO backup_settings (id) VALUES (1);
