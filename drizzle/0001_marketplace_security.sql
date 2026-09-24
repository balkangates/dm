-- DampingVar database hardening. Run after drizzle-kit push.
-- Application authorization is enforced in server actions. These policies also protect
-- deployments using a dedicated non-owner PostgreSQL role with app.user_id/app.role set.
CREATE OR REPLACE FUNCTION prevent_append_only_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; write a compensating entry instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS store_ledger_append_only ON store_ledger;
CREATE TRIGGER store_ledger_append_only BEFORE UPDATE OR DELETE ON store_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();
DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();
DROP TRIGGER IF EXISTS commission_transactions_append_only ON commission_transactions;
CREATE TRIGGER commission_transactions_append_only BEFORE UPDATE OR DELETE ON commission_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE garage_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cart_owner ON cart_items;
CREATE POLICY cart_owner ON cart_items USING (user_id::text = current_setting('app.user_id', true) OR current_setting('app.role', true) = 'admin');
DROP POLICY IF EXISTS favorites_owner ON favorites;
CREATE POLICY favorites_owner ON favorites USING (user_id::text = current_setting('app.user_id', true) OR current_setting('app.role', true) = 'admin');
DROP POLICY IF EXISTS garage_owner ON garage_vehicles;
CREATE POLICY garage_owner ON garage_vehicles USING (user_id::text = current_setting('app.user_id', true) OR current_setting('app.role', true) = 'admin');
DROP POLICY IF EXISTS customer_orders ON orders;
CREATE POLICY customer_orders ON orders USING (user_id::text = current_setting('app.user_id', true) OR current_setting('app.role', true) = 'admin');
DROP POLICY IF EXISTS store_order_access ON store_orders;
CREATE POLICY store_order_access ON store_orders USING (
  current_setting('app.role', true) = 'admin'
  OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id::text = current_setting('app.user_id', true))
  OR EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id::text = current_setting('app.user_id', true))
);
DROP POLICY IF EXISTS order_item_access ON order_items;
CREATE POLICY order_item_access ON order_items USING (
  current_setting('app.role', true) = 'admin'
  OR EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id::text = current_setting('app.user_id', true))
  OR EXISTS (SELECT 1 FROM store_orders so JOIN stores s ON s.id = so.store_id WHERE so.id = store_order_id AND s.owner_id::text = current_setting('app.user_id', true))
);
DROP POLICY IF EXISTS payment_customer ON payments;
CREATE POLICY payment_customer ON payments USING (
  current_setting('app.role', true) = 'admin' OR EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id::text = current_setting('app.user_id', true))
);
DROP POLICY IF EXISTS shipment_access ON shipments;
CREATE POLICY shipment_access ON shipments USING (
  current_setting('app.role', true) = 'admin'
  OR EXISTS (SELECT 1 FROM store_orders so JOIN orders o ON o.id = so.order_id WHERE so.id = store_order_id AND o.user_id::text = current_setting('app.user_id', true))
  OR EXISTS (SELECT 1 FROM store_orders so JOIN stores s ON s.id = so.store_id WHERE so.id = store_order_id AND s.owner_id::text = current_setting('app.user_id', true))
);
DROP POLICY IF EXISTS store_products_access ON store_products;
CREATE POLICY store_products_access ON store_products USING (
  current_setting('app.role', true) = 'admin'
  OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id::text = current_setting('app.user_id', true))
  OR (current_setting('app.role', true) <> 'store' AND active = true AND EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.status = 'approved'))
);
DROP POLICY IF EXISTS quote_request_access ON quote_requests;
CREATE POLICY quote_request_access ON quote_requests USING (
  customer_id::text = current_setting('app.user_id', true)
  OR current_setting('app.role', true) = 'admin'
  OR (current_setting('app.role', true) = 'store' AND status = 'open')
);
DROP POLICY IF EXISTS quote_offer_access ON quote_offers;
CREATE POLICY quote_offer_access ON quote_offers USING (
  current_setting('app.role', true) = 'admin'
  OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id::text = current_setting('app.user_id', true))
  OR EXISTS (SELECT 1 FROM quote_requests q WHERE q.id = quote_request_id AND q.customer_id::text = current_setting('app.user_id', true))
);
DROP POLICY IF EXISTS call_request_access ON call_requests;
CREATE POLICY call_request_access ON call_requests USING (
  customer_id::text = current_setting('app.user_id', true)
  OR current_setting('app.role', true) = 'admin'
  OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id::text = current_setting('app.user_id', true))
);
DROP POLICY IF EXISTS message_access ON messages;
CREATE POLICY message_access ON messages USING (
  current_setting('app.role', true) = 'admin'
  OR EXISTS (SELECT 1 FROM call_requests c WHERE c.id = call_request_id AND (c.customer_id::text = current_setting('app.user_id', true) OR EXISTS (SELECT 1 FROM stores s WHERE s.id = c.store_id AND s.owner_id::text = current_setting('app.user_id', true))))
);
DROP POLICY IF EXISTS ledger_store_access ON store_ledger;
CREATE POLICY ledger_store_access ON store_ledger USING (current_setting('app.role', true) = 'admin' OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id::text = current_setting('app.user_id', true)));
DROP POLICY IF EXISTS balance_store_access ON store_balances;
CREATE POLICY balance_store_access ON store_balances USING (current_setting('app.role', true) = 'admin' OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id::text = current_setting('app.user_id', true)));
DROP POLICY IF EXISTS payouts_store_access ON store_payouts;
CREATE POLICY payouts_store_access ON store_payouts USING (current_setting('app.role', true) = 'admin' OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id::text = current_setting('app.user_id', true)));
DROP POLICY IF EXISTS imports_store_access ON csv_imports;
CREATE POLICY imports_store_access ON csv_imports USING (current_setting('app.role', true) = 'admin' OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id::text = current_setting('app.user_id', true)));

DROP TRIGGER IF EXISTS order_items_append_only ON order_items;
CREATE TRIGGER order_items_append_only BEFORE UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION prevent_append_only_mutation();

ALTER TABLE oem_product_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oem_request_store_access ON oem_product_requests;
CREATE POLICY oem_request_store_access ON oem_product_requests USING (current_setting('app.role', true) = 'admin' OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id::text = current_setting('app.user_id', true)));
DROP POLICY IF EXISTS sales_invoice_access ON store_sales_invoices;
CREATE POLICY sales_invoice_access ON store_sales_invoices USING (
  current_setting('app.role', true) = 'admin'
  OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id::text = current_setting('app.user_id', true))
  OR EXISTS (SELECT 1 FROM store_orders so JOIN orders o ON o.id = so.order_id WHERE so.id = store_order_id AND o.user_id::text = current_setting('app.user_id', true))
);
DROP POLICY IF EXISTS commission_invoice_store_access ON commission_invoices;
CREATE POLICY commission_invoice_store_access ON commission_invoices USING (current_setting('app.role', true) = 'admin' OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id::text = current_setting('app.user_id', true)));
DROP POLICY IF EXISTS commission_transaction_store_access ON commission_transactions;
CREATE POLICY commission_transaction_store_access ON commission_transactions USING (current_setting('app.role', true) = 'admin' OR EXISTS (SELECT 1 FROM stores s WHERE s.id = store_id AND s.owner_id::text = current_setting('app.user_id', true)));
