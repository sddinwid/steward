-- A scoped synthetic participant cannot simultaneously occupy two units.
ALTER TABLE housing_reservations ADD COLUMN participant_alias text;
UPDATE housing_reservations r SET participant_alias=b.data->>'participantAlias'
FROM business_records b WHERE b.id=r.placement_id;
ALTER TABLE housing_reservations ALTER COLUMN participant_alias SET NOT NULL;
ALTER TABLE housing_reservations ADD CHECK(participant_alias ~ '^SYNREF-[A-F0-9]{32}$');
ALTER TABLE housing_reservations ADD CONSTRAINT participant_reservation_no_overlap
EXCLUDE USING gist(participant_alias WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&)
WHERE(state IN ('reserved','occupied'));
