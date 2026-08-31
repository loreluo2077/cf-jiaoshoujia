ALTER TABLE orders ADD COLUMN external_order_no TEXT;
ALTER TABLE orders ADD COLUMN external_notify_url TEXT;
ALTER TABLE orders ADD COLUMN external_return_url TEXT;
ALTER TABLE orders ADD COLUMN subject TEXT NOT NULL DEFAULT '个人支付网关充值';
CREATE UNIQUE INDEX orders_external_order_idx ON orders(external_order_no);
