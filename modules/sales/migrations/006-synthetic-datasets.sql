
ALTER TABLE integration_inbox ADD COLUMN IF NOT EXISTS simulation jsonb;
ALTER TABLE business_requests ADD COLUMN IF NOT EXISTS simulation jsonb;
CREATE TABLE IF NOT EXISTS simulation_dataset_epochs(dataset_id uuid PRIMARY KEY,run_id uuid NOT NULL,state text NOT NULL CHECK(state IN ('active','closed')),updated_at timestamptz NOT NULL DEFAULT now());

CREATE OR REPLACE FUNCTION commerce_order_projection() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revenue numeric:=0; quantity numeric:=0; line jsonb; fulfilled numeric; products jsonb:='[]'; line_revenue numeric;
BEGIN
 IF NEW.kind='order' AND NEW.data ? 'channel' THEN
  IF NOT COALESCE((NEW.data->>'commerceApproved')::boolean,false) THEN
   UPDATE commerce_orders SET revision=NEW.revision,projection=jsonb_set(projection,'{approved}','false') WHERE id=NEW.id AND projection->>'approved'='true';
   RETURN NEW;
  END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(NEW.data->'sourceLines') LOOP
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
CREATE FUNCTION withdraw_reset_simulation_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.kind='order' AND OLD.data ? 'simulation' THEN UPDATE commerce_orders SET revision=GREATEST(revision,OLD.revision)+1,projection=jsonb_set(projection,'{approved}','false') WHERE id=OLD.id; END IF;RETURN OLD;END $$;
 CREATE TRIGGER simulation_order_withdrawal AFTER DELETE ON business_records FOR EACH ROW EXECUTE FUNCTION withdraw_reset_simulation_order();
