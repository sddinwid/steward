CREATE TABLE replenishment_requirements(id uuid PRIMARY KEY,revision integer NOT NULL DEFAULT 1,projection jsonb NOT NULL);
CREATE FUNCTION inventory_replenishment_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.envelope->>'command'='stock.replenishment' THEN
  INSERT INTO replenishment_requirements(id,revision,projection) VALUES(NEW.command_id,1,(NEW.envelope->'payload')||jsonb_build_object('status',NEW.status))
  ON CONFLICT(id) DO UPDATE SET revision=replenishment_requirements.revision+1,projection=excluded.projection;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_replenishment_capture AFTER INSERT OR UPDATE ON integration_outbox FOR EACH ROW EXECUTE FUNCTION inventory_replenishment_projection();
