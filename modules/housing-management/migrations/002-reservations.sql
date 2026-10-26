-- Whole-unit reservations use a native exclusion constraint in addition to the
-- module's transaction lock. Releasing a reservation never deletes its history.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE housing_reservations(
 placement_id uuid PRIMARY KEY REFERENCES business_records(id),
 unit_id uuid NOT NULL REFERENCES business_records(id),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN ('reserved','occupied','released')),
 CHECK(starts_at<ends_at),
 EXCLUDE USING gist(unit_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&)
 WHERE(state IN ('reserved','occupied'))
);
