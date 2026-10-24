CREATE FUNCTION commerce_financial_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind='order' AND NEW.data ? 'financials' AND COALESCE((NEW.data->>'commerceApproved')::boolean,false) THEN
  UPDATE commerce_orders SET projection=projection||jsonb_build_object('financials',NEW.data->'financials') WHERE id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER commerce_order_financial_capture AFTER INSERT OR UPDATE ON business_records FOR EACH ROW EXECUTE FUNCTION commerce_financial_projection();
