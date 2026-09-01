-- Migration: Remove old apps/app_configs tables and rename downstream_merchants to apps
-- Also remove appId from orders and payment_provider_instances tables

-- Drop old app-related tables first
DROP TABLE IF EXISTS app_configs;
DROP TABLE IF EXISTS apps;

-- Drop old indexes
DROP INDEX IF EXISTS orders_app_idx;
DROP INDEX IF EXISTS providers_app_idx;

-- Create new orders table without old appId column, rename downstream_merchant_id to app_id
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
    app_id TEXT,
    plan_id TEXT,
    expires_at INTEGER NOT NULL,
    paid_at INTEGER,
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

-- Create new payment_provider_instances table without appId column
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

-- Rename downstream_merchants to apps with name field
CREATE TABLE apps (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    protocol TEXT NOT NULL,
    pid TEXT NOT NULL,
    secret TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Copy data from old orders table (rename downstream_merchant_id to app_id)
INSERT INTO orders_new SELECT
    id, user_id, user_email, amount, pay_amount, fee_rate, recharge_code,
    status, payment_status, delivery_status, payment_type, provider_instance_id,
    payment_trade_no, pay_url, qr_code, external_order_no, external_notify_url,
    external_return_url, subject, order_type, downstream_merchant_id, plan_id,
    expires_at, paid_at, completed_at, failed_reason, refund_amount, refund_reason,
    refund_at, client_ip, src_host, src_url, created_at, updated_at
FROM orders;

-- Copy data from old payment_provider_instances (remove appId column)
INSERT INTO payment_provider_instances_new SELECT
    id, provider_key, name, config, supported_types, enabled, sort_order,
    limits, refund_enabled, created_at, updated_at
FROM payment_provider_instances;

-- Copy data from downstream_merchants to apps (use code as name)
INSERT INTO apps SELECT
    id, code, code as name, protocol, pid, secret, enabled, created_at, updated_at
FROM downstream_merchants;

-- Drop old tables
DROP TABLE orders;
DROP TABLE payment_provider_instances;
DROP TABLE downstream_merchants;

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
CREATE UNIQUE INDEX apps_code_idx ON apps(code);
