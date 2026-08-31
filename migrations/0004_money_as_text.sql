-- Amounts are stored as decimal yuan strings (for example, '12.34'), never cents.
CREATE TABLE app_configs_new (
  app_id TEXT PRIMARY KEY NOT NULL,
  enabled_payment_types TEXT NOT NULL DEFAULT 'alipay,wxpay,stripe',
  min_amount TEXT NOT NULL DEFAULT '1.00',
  max_amount TEXT NOT NULL DEFAULT '1000.00',
  daily_limit TEXT NOT NULL DEFAULT '10000.00',
  order_timeout_minutes INTEGER NOT NULL DEFAULT 5,
  max_pending_orders INTEGER NOT NULL DEFAULT 3,
  balance_disabled INTEGER NOT NULL DEFAULT 0,
  help_text TEXT,
  help_image_url TEXT,
  updated_at INTEGER NOT NULL
);
INSERT INTO app_configs_new SELECT app_id, enabled_payment_types, printf('%.2f', min_amount / 100.0), printf('%.2f', max_amount / 100.0), printf('%.2f', daily_limit / 100.0), order_timeout_minutes, max_pending_orders, balance_disabled, help_text, help_image_url, updated_at FROM app_configs;
DROP TABLE app_configs;
ALTER TABLE app_configs_new RENAME TO app_configs;

CREATE TABLE orders_new (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT,
  amount TEXT NOT NULL,
  pay_amount TEXT NOT NULL,
  fee_rate INTEGER NOT NULL DEFAULT 0,
  recharge_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payment_type TEXT NOT NULL,
  payment_trade_no TEXT,
  pay_url TEXT,
  qr_code TEXT,
  order_type TEXT NOT NULL DEFAULT 'balance',
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
INSERT INTO orders_new SELECT id, app_id, user_id, user_email, printf('%.2f', amount / 100.0), printf('%.2f', pay_amount / 100.0), fee_rate, recharge_code, status, payment_type, payment_trade_no, pay_url, qr_code, order_type, plan_id, expires_at, paid_at, completed_at, failed_reason, CASE WHEN refund_amount IS NULL THEN NULL ELSE printf('%.2f', refund_amount / 100.0) END, refund_reason, refund_at, client_ip, src_host, src_url, created_at, updated_at FROM orders;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;
CREATE UNIQUE INDEX orders_recharge_code_idx ON orders(recharge_code);
CREATE INDEX orders_app_idx ON orders(app_id);
CREATE INDEX orders_user_idx ON orders(user_id);
CREATE INDEX orders_status_idx ON orders(status);
CREATE INDEX orders_created_idx ON orders(created_at);
