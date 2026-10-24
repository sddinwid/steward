CREATE TABLE commerce_exceptions(id uuid PRIMARY KEY,revision integer NOT NULL,projection jsonb NOT NULL);
CREATE FUNCTION commerce_condition_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='commerce-condition' THEN
  INSERT INTO commerce_exceptions VALUES(NEW.id,NEW.revision,NEW.data)
  ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_condition_capture AFTER INSERT OR UPDATE ON business_records FOR EACH ROW EXECUTE FUNCTION commerce_condition_projection();
