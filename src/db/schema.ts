import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const appSettings = sqliteTable('app_settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const orders = sqliteTable(
	'orders',
	{
		id: text('id').primaryKey(),
		userId: text('user_id').notNull(),
		userEmail: text('user_email'),
		amount: text('amount').notNull(),
		payAmount: text('pay_amount').notNull(),
		feeRate: integer('fee_rate').notNull().default(0),
		rechargeCode: text('recharge_code').notNull(),
		status: text('status').notNull().default('PENDING'),
		paymentStatus: text('payment_status').notNull().default('PENDING'),
		deliveryStatus: text('delivery_status').notNull().default('NOT_REQUIRED'),
		paymentType: text('payment_type').notNull(),
		providerInstanceId: text('provider_instance_id'),
		paymentTradeNo: text('payment_trade_no'),
		payUrl: text('pay_url'),
		qrCode: text('qr_code'),
		externalOrderNo: text('external_order_no'),
		externalNotifyUrl: text('external_notify_url'),
		externalReturnUrl: text('external_return_url'),
		subject: text('subject').notNull().default('个人支付网关充值'),
		orderType: text('order_type').notNull().default('balance'),
		appId: text('app_id'),
		planId: text('plan_id'),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		paidAt: integer('paid_at', { mode: 'timestamp' }),
		completedAt: integer('completed_at', { mode: 'timestamp' }),
		failedReason: text('failed_reason'),
		refundAmount: text('refund_amount'),
		refundReason: text('refund_reason'),
		refundAt: integer('refund_at', { mode: 'timestamp' }),
		clientIp: text('client_ip'),
		srcHost: text('src_host'),
		srcUrl: text('src_url'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	},
	(t) => [
		uniqueIndex('orders_recharge_code_idx').on(t.rechargeCode),
		index('orders_user_idx').on(t.userId),
		index('orders_status_idx').on(t.status),
		index('orders_created_idx').on(t.createdAt),
		uniqueIndex('orders_external_order_idx').on(t.externalOrderNo),
	],
);
export const auditLogs = sqliteTable(
	'audit_logs',
	{
		id: text('id').primaryKey(),
		orderId: text('order_id').notNull(),
		action: text('action').notNull(),
		detail: text('detail'),
		operator: text('operator'),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	},
	(t) => [index('audit_order_idx').on(t.orderId)],
);
export const paymentProviderInstances = sqliteTable(
	'payment_provider_instances',
	{
		id: text('id').primaryKey(),
		providerKey: text('provider_key').notNull(),
		name: text('name').notNull(),
		config: text('config').notNull().default('{}'),
		supportedTypes: text('supported_types').notNull().default(''),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		sortOrder: integer('sort_order').notNull().default(0),
		limits: text('limits'),
		refundEnabled: integer('refund_enabled', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	},
	(t) => [index('providers_key_idx').on(t.providerKey)],
);
export const systemConfigs = sqliteTable('system_configs', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	group: text('group').notNull().default('general'),
	label: text('label'),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
export const apps = sqliteTable(
	'apps',
	{
		id: text('id').primaryKey(),
		code: text('code').notNull(),
		name: text('name').notNull(),
		protocol: text('protocol').notNull(),
		pid: text('pid').notNull(),
		secret: text('secret').notNull(),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	},
	(t) => [uniqueIndex('apps_code_idx').on(t.code)],
);

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
export type App = typeof apps.$inferSelect;
export type NewApp = typeof apps.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type PaymentProviderInstance = typeof paymentProviderInstances.$inferSelect;
