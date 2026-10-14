CREATE TABLE hair_category (
    code VARCHAR(40) PRIMARY KEY,
    display_name VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE hair_length (
    centimeters INTEGER PRIMARY KEY,
    CONSTRAINT hair_length_positive CHECK (centimeters > 0)
);

INSERT INTO hair_category (code, display_name) VALUES
    ('normal', 'Normal'),
    ('choco', 'Choco'),
    ('tinturado', 'Tinturado'),
    ('premium', 'Premium'),
    ('elite', 'Elite');

INSERT INTO hair_length (centimeters) VALUES
    (38), (40), (45), (50), (55), (60), (70), (80), (90), (100);
