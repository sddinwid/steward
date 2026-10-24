-- Preserve the legacy projection contract without copying new source/receipt fields.
CREATE OR REPLACE FUNCTION sales_demand_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='order' THEN
  IF NEW.data ? 'channel' AND NOT COALESCE((NEW.data->>'commerceApproved')::boolean,false) THEN
   UPDATE sales_demand SET revision=NEW.revision,projection=jsonb_set(projection,'{approved}','false') WHERE id=NEW.id AND projection->>'approved'='true';
  ELSE
   INSERT INTO sales_demand VALUES(NEW.id,NEW.revision,jsonb_build_object('number',NEW.data->>'number','currency',NEW.data->>'currency','lines',NEW.data->'lines','status',NEW.data->>'status','stockStatus',NEW.data->>'stockStatus','approved',true))
   ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TABLE commerce_orders(id uuid PRIMARY KEY,revision integer NOT NULL,projection jsonb NOT NULL);
CREATE FUNCTION commerce_order_projection() RETURNS trigger LANGUAGE plpgsql AS $$
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
   'costSource','Production catalog and shipping quote; estimates unless explicitly known'))
  ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,projection=excluded.projection;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_order_capture AFTER INSERT OR UPDATE ON business_records FOR EACH ROW EXECUTE FUNCTION commerce_order_projection();
