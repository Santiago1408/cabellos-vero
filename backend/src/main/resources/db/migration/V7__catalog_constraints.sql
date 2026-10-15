ALTER TABLE hair_category
    ADD CONSTRAINT hair_category_name_not_blank CHECK (length(trim(display_name)) > 0);

CREATE UNIQUE INDEX hair_category_name_normalized_unique
    ON hair_category (lower(trim(display_name)));
