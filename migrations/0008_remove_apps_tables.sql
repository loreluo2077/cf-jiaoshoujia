-- Migration: Remove apps and appConfigs tables, remove appId columns
-- This migration removes the multi-app architecture as the system is single-app only

-- Drop indexes first
DROP INDEX IF EXISTS orders_app_idx;
DROP INDEX IF EXISTS providers_app_idx;

-- Create new tables without appId
CREATE TABLE orders_new (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_email TEXT,
    amount TEXT NOT NULL,
    pay_amount TEXT NOT NULL,
    fee_rate INTEGER NOT NULL DEFAULT 0,
    recharge_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    payment_status TEXT NOT NULL DEFAULT 'PENDING',
    delivery_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    payment_type TEXT NOT NULL,
    provider_instance_id TEXT,
    payment_trade_no TEXT,
    pay_url TEXT,
    qr_code TEXT,
    external_order_no TEXT,
    external_notify_url TEXT,
    external_return_url TEXT,
    subject TEXT NOT NULL DEFAULT '个人支付网关充值',
    order_type TEXT NOT NULL DEFAULT 'balance',
    downstream_merchant_id TEXT,
    plan_id TEXT,
    expires_at INTEGER NOT NULL,
    paidAt INTEGER,
    completed_at INTEGER,
    failed_reason TEXT,
    refund_amount TEXT,
    refund_reason TEXT,
    refund_at INTEGER,
    client_ip TEXT,
    src_host TEXT,
    src_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE payment_provider_instances_new (
    id TEXT PRIMARY KEY,
    provider_key TEXT NOT NULL,
    name TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    supported_types TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    limits TEXT,
    refund_enabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Copy data from old tables
INSERT INTO orders_new SELECT
    id, user_id, user_email, amount, pay_amount, fee_rate, recharge_code,
    status, payment_status, delivery_status, payment_type, provider_instance_id,
    payment_trade_no, pay_url, qr_code, external_order_no, external_notify_url,
    external_return_url, subject, order_type, downstream_merchant_id, plan_id,
    expires_at, paidAt, completed_at, failed_reason, refund_amount, refund_reason,
    refund_at, client_ip, src_host, src_url, created_at, updated_at
FROM orders;

INSERT INTO payment_provider_instances_new SELECT
    id, provider_key, name, config, supported_types, enabled, sort_order,
    limits, refund_enabled, created_at, updated_at
FROM payment_provider_instances;

-- Drop old tables
DROP TABLE orders;
DROP TABLE payment_provider_instances;
DROP TABLE app_configs;
DROP TABLE apps;

-- Rename new tables
ALTER TABLE orders_new RENAME TO orders;
ALTER TABLE payment_provider_instances_new RENAME TO payment_provider_instances;

-- Recreate indexes
CREATE UNIQUE INDEX orders_recharge_code_idx ON orders(recharge_code);
CREATE INDEX orders_user_idx ON orders(user_id);
CREATE INDEX orders_status_idx ON orders(status);
CREATE INDEX orders_created_idx ON orders(created_at);
CREATE UNIQUE INDEX orders_external_order_idx ON orders(external_order_no);
CREATE INDEX providers_key_idx ON payment_provider_instances(provider_key);
