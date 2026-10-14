CREATE TABLE app_user (
    id UUID PRIMARY KEY,
    username VARCHAR(80) NOT NULL,
    username_normalized VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    full_name VARCHAR(160),
    ci VARCHAR(40),
    birth_date DATE,
    phone VARCHAR(40),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT app_user_role_valid CHECK (role IN ('ADMIN', 'EMPLOYEE')),
    CONSTRAINT app_user_employee_profile CHECK (
        role <> 'EMPLOYEE' OR (
            NULLIF(trim(full_name), '') IS NOT NULL
            AND NULLIF(trim(ci), '') IS NOT NULL
            AND birth_date IS NOT NULL
            AND NULLIF(trim(phone), '') IS NOT NULL
        )
    )
);

CREATE UNIQUE INDEX app_user_one_admin ON app_user (role) WHERE role = 'ADMIN';
