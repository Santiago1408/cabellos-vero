ALTER TABLE app_user_history
    ADD COLUMN reason VARCHAR(500);

CREATE UNIQUE INDEX app_user_employee_ci_unique
    ON app_user (lower(trim(ci)))
    WHERE role = 'EMPLOYEE';
