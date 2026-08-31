ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE orders ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE orders ADD COLUMN downstream_merchant_id TEXT;
UPDATE orders SET payment_status = CASE WHEN status IN ('PAID','COMPLETED','REFUNDED','PARTIALLY_REFUNDED') THEN 'PAID' ELSE status END;
UPDATE orders SET delivery_status = CASE WHEN order_type = 'easypay_bridge' AND status = 'COMPLETED' THEN 'DELIVERED' WHEN order_type = 'easypay_bridge' THEN 'PENDING' ELSE 'NOT_REQUIRED' END;
CREATE TABLE downstream_merchants (id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL, protocol TEXT NOT NULL, pid TEXT NOT NULL, secret TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX downstream_merchants_code_idx ON downstream_merchants(code);
UPDATE payment_provider_instances SET provider_key = 'xunhupay' WHERE provider_key = 'easypay' AND config LIKE '%"appid"%';
