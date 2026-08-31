ALTER TABLE orders ADD COLUMN provider_instance_id TEXT;
CREATE INDEX orders_provider_instance_idx ON orders(provider_instance_id);
