-- New unpublished conditions stay local; retain explicit withdrawal of previously published copies.
CREATE OR REPLACE FUNCTION commerce_condition_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='commerce-condition' THEN
  IF COALESCE((NEW.data->>'approved')::boolean,false) THEN
   INSERT INTO commerce_exceptions VALUES(NEW.id,NEW.revision,NEW.data)
   ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
  ELSE
   UPDATE commerce_exceptions SET revision=NEW.revision,projection=projection||jsonb_build_object('approved',false,'active',false)
   WHERE id=NEW.id AND projection->>'approved'='true';
  END IF;
 END IF;
 RETURN NEW;
END $$;
