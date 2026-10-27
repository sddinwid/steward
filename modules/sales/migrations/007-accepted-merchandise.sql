-- Original migrations and emitted envelopes remain unchanged. Current observations
-- are retained as observations, never substituted for missing acceptance receipts.
CREATE TABLE sales_accepted_prices(order_id uuid PRIMARY KEY,snapshot jsonb NOT NULL,digest text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE sales_source_observations(source_module text NOT NULL,command_id uuid NOT NULL,wire jsonb NOT NULL,digest text NOT NULL,provider_identity jsonb,recorded_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_module,command_id));
CREATE TABLE sales_price_reconciliations(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_id uuid NOT NULL,actor text NOT NULL,decision jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION sales_price_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Sales price evidence is append-only'; END $$;
CREATE TRIGGER accepted_price_immutable BEFORE UPDATE OR DELETE ON sales_accepted_prices FOR EACH ROW EXECUTE FUNCTION sales_price_append_only();
CREATE TRIGGER source_observation_immutable BEFORE UPDATE OR DELETE ON sales_source_observations FOR EACH ROW EXECUTE FUNCTION sales_price_append_only();
CREATE TRIGGER price_reconciliation_immutable BEFORE UPDATE OR DELETE ON sales_price_reconciliations FOR EACH ROW EXECUTE FUNCTION sales_price_append_only();
-- Validate historical receipts defensively. Malformed/incomplete proof stays unknown.
CREATE FUNCTION sales_receipt_lines(receipt jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE accepted jsonb; l jsonb; gross jsonb; q numeric; u numeric; n numeric;
BEGIN
 IF jsonb_typeof(receipt->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(receipt->'lines')=0 THEN RETURN NULL; END IF;
 IF receipt ? 'channel' THEN accepted:=receipt->'sourceLines';
 ELSE SELECT jsonb_agg(v||jsonb_build_object('lineRevenueCents',(v->>'quantity')::numeric*(v->>'unitPriceCents')::numeric)) INTO accepted FROM jsonb_array_elements(receipt->'lines') v; END IF;
 IF jsonb_typeof(accepted) IS DISTINCT FROM 'array' OR jsonb_array_length(accepted)<>jsonb_array_length(receipt->'lines') THEN RETURN NULL; END IF;
 IF (SELECT count(DISTINCT v->>'sku') FROM jsonb_array_elements(accepted) v)<>jsonb_array_length(accepted) THEN RETURN NULL; END IF;
 FOR l IN SELECT value FROM jsonb_array_elements(accepted) LOOP
  IF NOT (l ?& ARRAY['sku','quantity','unitPriceCents','lineRevenueCents']) OR jsonb_typeof(l->'sku') IS DISTINCT FROM 'string' OR jsonb_typeof(l->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(l->'unitPriceCents') IS DISTINCT FROM 'number' OR jsonb_typeof(l->'lineRevenueCents') IS DISTINCT FROM 'number' THEN RETURN NULL; END IF;
  q:=(l->>'quantity')::numeric;u:=(l->>'unitPriceCents')::numeric;n:=(l->>'lineRevenueCents')::numeric;
  IF q<1 OR q>100000000 OR q<>trunc(q) OR u<0 OR u>1000000000000 OR u<>trunc(u) OR n<0 OR n>100000000000000 OR n<>trunc(n) OR n>q*u THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(receipt->'lines') g WHERE g->>'sku'=l->>'sku' AND g->'quantity'=l->'quantity' AND g->'unitPriceCents'=l->'unitPriceCents') THEN RETURN NULL; END IF;
 END LOOP;
 RETURN accepted;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $$;
-- Only unique consistent successful confirmation receipts establish acceptance.
-- Steward receipt time does not claim an external checkout/payment time.
WITH receipts AS (
 SELECT r.id AS order_id,b.request_id,b.actor,b.created_at,b.response->'record' AS receipt,
 CASE WHEN b.response->'record'->>'currency'=r.data->>'currency' AND b.response->'record'->'lines'=r.data->'lines'
 THEN sales_receipt_lines(b.response->'record') ELSE NULL END AS accepted_lines
 FROM business_records r JOIN business_requests b ON b.operation='/confirm/:id' AND b.response->'record'->>'id'=r.id::text
 WHERE r.kind='order' AND r.data->>'status'<>'draft' AND b.response->'record'->>'status'='confirmed'
), consistent AS (
 SELECT order_id FROM receipts GROUP BY order_id HAVING count(DISTINCT accepted_lines)=1 AND bool_and(accepted_lines IS NOT NULL)
), chosen AS (
 SELECT DISTINCT ON (r.order_id) r.* FROM receipts r JOIN consistent c USING(order_id) ORDER BY r.order_id,r.created_at,r.request_id
), snapshots AS (
 SELECT order_id,jsonb_build_object('contractVersion',1,'mode','legacy-receipt','currency',receipt->>'currency','lines',accepted_lines,'actor',actor,'recordedAt',created_at,'proof',jsonb_build_object('kind','confirmation-receipt','requestId',request_id,'receiptDigestEncoding','postgres-jsonb-text/sha256','receiptDigest',encode(sha256(convert_to(receipt::text,'UTF8')),'hex'))) AS snapshot FROM chosen
)
INSERT INTO sales_accepted_prices(order_id,snapshot,digest)
 SELECT order_id,snapshot,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') FROM snapshots;
CREATE OR REPLACE FUNCTION commerce_order_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE accepted jsonb; revenue numeric:=0; quantity numeric:=0; line jsonb; fulfilled numeric; products jsonb:='[]'; line_revenue numeric;
BEGIN
 IF NEW.kind='order' AND NEW.data ? 'channel' THEN
  SELECT snapshot INTO accepted FROM sales_accepted_prices WHERE order_id=NEW.id;
  IF NOT COALESCE((NEW.data->>'commerceApproved')::boolean,false) OR (NEW.data->>'status'<>'draft' AND accepted IS NULL) THEN
   UPDATE commerce_orders SET revision=NEW.revision,projection=jsonb_set(projection,'{approved}','false') WHERE id=NEW.id AND projection->>'approved'='true';
   RETURN NEW;
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(COALESCE(accepted->'lines',NEW.data->'sourceLines')) LOOP
   fulfilled:=COALESCE((NEW.data->'fulfilled'->>(line->>'sku'))::numeric,0);
   line_revenue:=floor((line->>'lineRevenueCents')::numeric*fulfilled/(line->>'quantity')::numeric);
   revenue:=revenue+line_revenue;
   quantity:=quantity+fulfilled;
   products:=products||jsonb_build_array(line||jsonb_build_object('fulfilledQuantity',fulfilled,'recognizedRevenueCents',line_revenue));
  END LOOP;
  INSERT INTO commerce_orders VALUES(NEW.id,NEW.revision,jsonb_build_object(
   'approved',COALESCE((NEW.data->>'commerceApproved')::boolean,false),'contractVersion',1,
   'channel',NEW.data->>'channel','sourceId',NEW.data->>'sourceId','sourceUpdatedAt',NEW.data->>'sourceUpdatedAt',
   'orderCreatedAt',NEW.data->>'createdAt','fulfilledAt',NEW.data->>'completedAt','status',NEW.data->>'status',
   'productionStatus',NEW.data->>'productionStatus','currency',NEW.data->>'currency','units','items',
   'quantity',quantity,'recognizedRevenueCents',revenue,'refundCents',NEW.data->'refundCents',
   'productionCostCents',NEW.data->'productionCostCents','shippingCostCents',NEW.data->'shippingCostCents',
   'costBasis',COALESCE(NEW.data->>'costBasis','incomplete'),'products',products,
   'stockout',CASE WHEN NEW.data->'reservationEvidence' IS NOT NULL AND NEW.data->'reservationEvidence'<>'null'::jsonb THEN jsonb_path_exists(NEW.data->'reservationEvidence','$[*] ? (@.reserved < @.requested)') ELSE NULL END,
   'revenueBasis','Completed merchandise quantities after line discounts; excludes shipping and tax',
   'refundBasis','Source total refunds; tax/shipping refunds are not allocated to products',
   'costSource','Production catalog and shipping quote; estimates unless explicitly known') || CASE WHEN NEW.data ? 'financials' THEN jsonb_build_object('financials',NEW.data->'financials') ELSE '{}'::jsonb END || CASE WHEN NEW.data ? 'simulation' THEN jsonb_build_object('simulation',NEW.data->'simulation','simulationState',jsonb_build_object('stockStatus',NEW.data->>'stockStatus','reservationFailure',NEW.data->'reservationFailure','productionRequested',COALESCE((NEW.data->>'productionRequested')::boolean,false),'productionRequestedAt',NEW.data->'productionRequestedAt','productionObservedAt',NEW.data->'productionObservedAt')) ELSE '{}'::jsonb END)
  ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
 END IF;
 RETURN NEW;
END $$;

-- Preserve the legacy projection contract without copying new source/receipt fields.
CREATE OR REPLACE FUNCTION sales_demand_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='order' THEN
  IF (NEW.data ? 'channel' AND NOT COALESCE((NEW.data->>'commerceApproved')::boolean,false)) OR (NEW.data->>'status'<>'draft' AND NOT EXISTS(SELECT 1 FROM sales_accepted_prices WHERE order_id=NEW.id)) THEN
   UPDATE sales_demand SET revision=NEW.revision,projection=jsonb_set(projection,'{approved}','false') WHERE id=NEW.id AND projection->>'approved'='true';
  ELSE
   INSERT INTO sales_demand VALUES(NEW.id,NEW.revision,jsonb_build_object('number',NEW.data->>'number','currency',NEW.data->>'currency','lines',(SELECT jsonb_agg(jsonb_build_object('sku',l->>'sku','quantity',l->'quantity','unitPriceCents',l->'unitPriceCents')) FROM jsonb_array_elements(NEW.data->'lines') l),'status',NEW.data->>'status','stockStatus',NEW.data->>'stockStatus','approved',true))
   ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- Recompute only derived projections, emitting newer withdrawals for unknown legacy
-- acceptance. Previously emitted source_event envelopes are not edited.
UPDATE business_records SET revision=revision+1 WHERE kind='order';
