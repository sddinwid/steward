CREATE TABLE monitored_commerce_v1(id uuid PRIMARY KEY,revision integer NOT NULL,projection jsonb NOT NULL);
CREATE FUNCTION monitored_commerce_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='monitored-publication' THEN
  INSERT INTO monitored_commerce_v1 VALUES(NEW.id,NEW.revision,NEW.data->'projection')
  ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER monitored_commerce_capture AFTER INSERT OR UPDATE ON business_records FOR EACH ROW EXECUTE FUNCTION monitored_commerce_projection();
-- Preserve local history and publish only a deliberately minimal approved exception.
CREATE OR REPLACE FUNCTION commerce_condition_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='commerce-condition' THEN
  IF COALESCE((NEW.data->>'approved')::boolean,false) THEN
   INSERT INTO commerce_exceptions VALUES(NEW.id,NEW.revision,jsonb_build_object('contractVersion',1,'approved',true,'active',COALESCE((NEW.data->>'active')::boolean,false),'sourceId',NEW.data->>'sourceId','order',NEW.data->>'order','code',NEW.data->>'code','explanation',NEW.data->>'explanation','severity',NEW.data->>'severity'))
   ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
  ELSE
   UPDATE commerce_exceptions SET revision=NEW.revision,projection=projection||jsonb_build_object('approved',false,'active',false) WHERE id=NEW.id AND projection->>'approved'='true';
  END IF;
 END IF;
 RETURN NEW;
END $$;
