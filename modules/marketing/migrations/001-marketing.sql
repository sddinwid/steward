
CREATE TABLE IF NOT EXISTS business_records(id uuid PRIMARY KEY,kind text NOT NULL,key text NOT NULL,data jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(kind,key));
CREATE INDEX IF NOT EXISTS business_records_kind ON business_records(kind,key);
CREATE TABLE IF NOT EXISTS business_requests(request_id uuid PRIMARY KEY,actor text NOT NULL,operation text NOT NULL,digest text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS business_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor text NOT NULL,operation text NOT NULL,record_id uuid,created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS integration_outbox(command_id uuid PRIMARY KEY,envelope jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','rejected')),attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),last_error text,result jsonb,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
CREATE INDEX IF NOT EXISTS integration_outbox_due ON integration_outbox(next_attempt_at,created_at) WHERE status='pending';
CREATE TABLE IF NOT EXISTS integration_inbox(source_module text NOT NULL,command_id uuid NOT NULL,digest text NOT NULL,response jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_module,command_id));
CREATE TABLE IF NOT EXISTS integration_sequences(source_module text NOT NULL,aggregate_id uuid NOT NULL,sequence bigint NOT NULL,PRIMARY KEY(source_module,aggregate_id));

ALTER TABLE integration_inbox ADD COLUMN IF NOT EXISTS simulation jsonb;
ALTER TABLE business_requests ADD COLUMN IF NOT EXISTS simulation jsonb;
CREATE TABLE IF NOT EXISTS simulation_dataset_epochs(dataset_id uuid PRIMARY KEY,run_id uuid NOT NULL,state text NOT NULL CHECK(state IN ('active','closed')),updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE marketing_reports_v1(id uuid PRIMARY KEY,revision integer NOT NULL,projection jsonb NOT NULL);
CREATE TABLE commerce_exceptions(id uuid PRIMARY KEY,revision integer NOT NULL,projection jsonb NOT NULL);
CREATE FUNCTION marketing_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='publication' THEN
  INSERT INTO marketing_reports_v1 VALUES(NEW.id,NEW.revision,NEW.data->'projection')
  ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
 ELSIF NEW.kind='condition' AND (NEW.data->>'approved'='true' OR EXISTS(SELECT 1 FROM commerce_exceptions WHERE id=NEW.id)) THEN
  INSERT INTO commerce_exceptions VALUES(NEW.id,NEW.revision,jsonb_build_object('contractVersion',1,'approved',coalesce((NEW.data->>'approved')::boolean,false),'active',(NEW.data->>'active')::boolean,'sourceId',NEW.data->>'sourceId','order',NEW.data->>'order','code',NEW.data->>'code','explanation',NEW.data->>'explanation','severity',NEW.data->>'severity'))
  ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER marketing_projection_capture AFTER INSERT OR UPDATE ON business_records FOR EACH ROW EXECUTE FUNCTION marketing_projection();
