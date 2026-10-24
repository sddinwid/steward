-- Emit one projection per order revision. Never mutate an already emitted envelope.
DROP TRIGGER commerce_order_financial_capture ON business_records;
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
   'costSource','Production catalog and shipping quote; estimates unless explicitly known') || CASE WHEN NEW.data ? 'financials' THEN jsonb_build_object('financials',NEW.data->'financials') ELSE '{}'::jsonb END)
  ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
 END IF;
 RETURN NEW;
END $$;

CREATE TABLE commerce_projection_repairs(event_id uuid PRIMARY KEY,record_id uuid NOT NULL,source_revision bigint NOT NULL,reason text NOT NULL,repaired_at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN
 IF to_regclass('sync_outbox') IS NOT NULL THEN
  INSERT INTO commerce_projection_repairs(event_id,record_id,source_revision,reason)
  SELECT event_id,(envelope->>'recordId')::uuid,(envelope->>'recordRevision')::bigint,'Superseded conflicting pre-1.2.1 financial projection; authoritative order is republished at a higher revision'
  FROM sync_outbox WHERE acknowledged_at IS NULL AND envelope->>'streamId'='commerce_orders'
   AND EXISTS(SELECT 1 FROM business_records b WHERE b.id::text=envelope->>'recordId' AND b.kind='order' AND b.data ? 'financials');
  UPDATE sync_outbox o SET acknowledged_at=now(),error_code='SUPERSEDED_BY_FINANCIAL_PROJECTION_REPAIR' FROM commerce_projection_repairs r WHERE o.event_id=r.event_id;
 END IF;
END $$;
INSERT INTO business_audit(actor,operation,record_id) SELECT 'module-migration-5','commerce.financial_projection_repaired',id FROM business_records WHERE kind='order' AND data ? 'financials';
UPDATE business_records SET revision=revision+1,updated_at=now() WHERE kind='order' AND data ? 'financials';
