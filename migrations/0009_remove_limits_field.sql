-- Migration: Remove limits field from payment_provider_instances table

CREATE TABLE payment_provider_instances_new (
    id TEXT PRIMARY KEY,
    provider_key TEXT NOT NULL,
    name TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    supported_types TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    refund_enabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Copy data from old table
INSERT INTO payment_provider_instances_new SELECT
    id, provider_key, name, config, supported_types, enabled, sort_order,
    refund_enabled, created_at, updated_at
FROM payment_provider_instances;

-- Drop old table
DROP TABLE payment_provider_instances;

-- Rename new table
ALTER TABLE payment_provider_instances_new RENAME TO payment_provider_instances;

-- Recreate index
CREATE INDEX providers_key_idx ON payment_provider_instances(provider_key);
