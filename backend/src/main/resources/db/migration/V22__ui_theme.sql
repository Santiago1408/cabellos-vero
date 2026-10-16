-- Preferencia visual de la instalación; no forma parte de los movimientos del negocio.
CREATE TABLE ui_theme (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    primary_color VARCHAR(7) NOT NULL DEFAULT '#171717',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ui_theme_color_format CHECK (primary_color ~ '^#[0-9a-f]{6}$')
);

INSERT INTO ui_theme (id) VALUES (1);
