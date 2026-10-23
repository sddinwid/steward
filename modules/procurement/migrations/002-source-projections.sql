CREATE TABLE purchase_commitments(id uuid PRIMARY KEY,revision integer NOT NULL,projection jsonb NOT NULL);
CREATE FUNCTION procurement_commitment_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='order' THEN
  INSERT INTO purchase_commitments(id,revision,projection) VALUES(NEW.id,NEW.revision,NEW.data)
  ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER procurement_commitment_capture AFTER INSERT OR UPDATE ON business_records FOR EACH ROW EXECUTE FUNCTION procurement_commitment_projection();
