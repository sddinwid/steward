CREATE TABLE sales_demand(id uuid PRIMARY KEY,revision integer NOT NULL,projection jsonb NOT NULL);
CREATE FUNCTION sales_demand_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='order' THEN
  INSERT INTO sales_demand(id,revision,projection) VALUES(NEW.id,NEW.revision,NEW.data - 'customerCode')
  ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sales_demand_capture AFTER INSERT OR UPDATE ON business_records FOR EACH ROW EXECUTE FUNCTION sales_demand_projection();
