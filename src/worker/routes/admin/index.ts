import { Hono } from 'hono';
import { createDb } from '../../../db/client';
import { AppRepository } from '../../repositories/app';
import { AuditLogRepository } from '../../repositories/audit-log';
import { OrderRepository } from '../../repositories/order';
import { ProviderRepository } from '../../repositories/provider';
import { deliverPaidOrder } from '../../services/order-delivery-service';
import { RefundService } from '../../services/refund-service';
import { createPaymentProviders } from '../../payment/providers';
import { sign } from '../../payment/downstream/easypay';
import { easyPayBridgeRoutes } from '../downstream/easypay';

export const adminGatewayRoutes = new Hono<{ Bindings: Env }>();

adminGatewayRoutes.get('/dashboard', async (c) => {
	const db = createDb(c.env.DB);
	const appDao = new AppRepository(db);
	const orderDao = new OrderRepository(db);
	const app = await appDao.findByCode('default');
	if (!app) return c.json({ orders: 0, paid: 0, revenue: 0 });
	const rows = await orderDao.findByAppId(app.id);
	return c.json({
		orders: rows.length,
		pending: rows.filter((r) => r.status === 'PENDING').length,
		paid: rows.filter((r) => ['PAID', 'COMPLETED'].includes(r.status)).length,
		revenue: rows.filter((r) => ['PAID', 'COMPLETED'].includes(r.status)).reduce((s, r) => s + Number(r.amount), 0),
	});
});

adminGatewayRoutes.get('/payment-tests/config', async (c) => {
	const db = createDb(c.env.DB);
	const appDao = new AppRepository(db);
	const providerDao = new ProviderRepository(db);
	const app = await appDao.findByCode('default');
	if (!app) return c.json({ error: 'default app not found' }, 404);
	const cfg = await appDao.findConfig(app.id);
	const providers = await providerDao.findByAppId(app.id);
	const enabledPaymentTypes = Array.from(
		new Set(
			(cfg?.enabledPaymentTypes || '')
				.split(',')
				.map((v) => v.trim())
				.filter(Boolean)
				.map((v) => (v === 'alipay_direct' ? 'alipay' : v === 'wxpay_direct' ? 'wxpay' : v))
				.filter((v) => ['alipay', 'wxpay', 'stripe'].includes(v)),
		),
	);
	return c.json({
		app: { name: app.name },
		apps: [app],
		enabledPaymentTypes,
		paymentProviders: providers.map(({ config: _config, ...p }) => p),
		minAmount: Number(cfg?.minAmount || 1),
		maxAmount: Number(cfg?.maxAmount || 1000),
		orderTimeoutMinutes: cfg?.orderTimeoutMinutes || 5,
		balanceDisabled: Boolean(cfg?.balanceDisabled),
	});
});

adminGatewayRoutes.get('/payment-tests/orders/:id', async (c) => {
	const db = createDb(c.env.DB);
	const orderDao = new OrderRepository(db);
	const row = await orderDao.findById(c.req.param('id'));
	if (!row) return c.json({ error: 'Order not found' }, 404);
	return c.json({
		order: {
			...row,
			amount: Number(row.amount),
			payAmount: Number(row.payAmount),
			expiresAt: row.expiresAt.toISOString(),
			paidAt: row.paidAt?.toISOString() || null,
		},
	});
});

adminGatewayRoutes.post('/payment-tests/orders/:id/cancel', async (c) => {
	const db = createDb(c.env.DB);
	const orderDao = new OrderRepository(db);
	const cancelled = await orderDao.cancelPending(c.req.param('id'));
	if (!cancelled) return c.json({ error: 'Only pending orders can be cancelled' }, 409);
	return c.json({ status: 'CANCELLED' });
});

adminGatewayRoutes.get('/apps', async (c) => {
	const db = createDb(c.env.DB);
	const appDao = new AppRepository(db);
	const rows = await appDao.findAll();
	return c.json({ apps: rows });
});

adminGatewayRoutes.get('/apps/:id', async (c) => {
	const db = createDb(c.env.DB);
	const appDao = new AppRepository(db);
	const app = await appDao.findById(c.req.param('id'));
	if (!app) return c.json({ error: 'App not found' }, 404);
	const config = await appDao.findConfig(app.id);
	return c.json({ app, config });
});

adminGatewayRoutes.patch('/apps/:id', async (c) => {
	const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
	const patch: Partial<{ name: string; status: string; updatedAt: Date }> = { updatedAt: new Date() };
	if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
	if (typeof body.status === 'string' && ['active', 'paused'].includes(body.status)) patch.status = body.status;
	const db = createDb(c.env.DB);
	const appDao = new AppRepository(db);
	await appDao.update(c.req.param('id'), patch);
	return c.json({ ok: true });
});

adminGatewayRoutes.put('/apps/:id/config', async (c) => {
	const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (typeof b.enabledPaymentTypes === 'string') patch.enabledPaymentTypes = b.enabledPaymentTypes;
	if (Number.isFinite(Number(b.minAmount))) patch.minAmount = Number(b.minAmount).toFixed(2);
	if (Number.isFinite(Number(b.maxAmount))) patch.maxAmount = Number(b.maxAmount).toFixed(2);
	if (Number.isFinite(Number(b.orderTimeoutMinutes))) patch.orderTimeoutMinutes = Math.max(1, Math.trunc(Number(b.orderTimeoutMinutes)));
	if (typeof b.balanceDisabled === 'boolean') patch.balanceDisabled = b.balanceDisabled;
	const db = createDb(c.env.DB);
	const appDao = new AppRepository(db);
	await appDao.updateConfig(c.req.param('id'), patch);
	return c.json({ ok: true });
});

adminGatewayRoutes.get('/orders', async (c) => {
	const db = createDb(c.env.DB);
	const orderDao = new OrderRepository(db);
	const page = Math.max(1, Number(c.req.query('page')) || 1);
	const pageSize = Math.min(500, Math.max(1, Number(c.req.query('page_size') || c.req.query('limit')) || 50));
	const status = c.req.query('status');
	const paymentType = c.req.query('payment_type');
	const userId = c.req.query('user_id');
	const { rows, total } = await orderDao.findFiltered({ status, paymentType, userId, page, pageSize });
	return c.json({
		orders: rows,
		pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
	});
});

adminGatewayRoutes.get('/providers', async (c) => {
	const db = createDb(c.env.DB);
	const providerDao = new ProviderRepository(db);
	const rows = await providerDao.findAll();
	return c.json({ providers: rows.map(({ config: _config, ...provider }) => provider) });
});

adminGatewayRoutes.get('/providers/:id', async (c) => {
	const db = createDb(c.env.DB);
	const providerDao = new ProviderRepository(db);
	const appDao = new AppRepository(db);
	const provider = await providerDao.findById(c.req.param('id'));
	if (!provider) return c.json({ error: 'Provider not found' }, 404);
	const app = await appDao.findById(provider.appId);
	let config: Record<string, unknown> = {};
	try {
		config = JSON.parse(provider.config || '{}') as Record<string, unknown>;
	} catch {
		config = {};
	}
	return c.json({ provider: { ...provider, config }, app });
});

adminGatewayRoutes.post('/providers', async (c) => {
	const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
	const name = String(b.name || '').trim();
	const providerKey = String(b.providerKey || '').trim();
	if (!name || !providerKey) return c.json({ error: 'providerKey and name are required' }, 400);
	const db = createDb(c.env.DB);
	const appDao = new AppRepository(db);
	const providerDao = new ProviderRepository(db);
	const app = await appDao.findByCode('default');
	if (!app) return c.json({ error: 'default app not found' }, 404);
	const t = new Date();
	const provider = {
		id: crypto.randomUUID(),
		appId: app.id,
		providerKey,
		name,
		config: typeof b.config === 'string' ? b.config : JSON.stringify(b.config || {}),
		supportedTypes: String(b.supportedTypes || ''),
		enabled: b.enabled !== false,
		sortOrder: Number(b.sortOrder) || 0,
		limits: null,
		refundEnabled: b.refundEnabled === true,
		createdAt: t,
		updatedAt: t,
	};
	await providerDao.insert(provider);
	return c.json({ provider }, 201);
});

adminGatewayRoutes.put('/config', async (c) => {
	const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
	const db = createDb(c.env.DB);
	const appDao = new AppRepository(db);
	const app = await appDao.findByCode('default');
	if (!app) return c.json({ error: 'default app not found' }, 404);
	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (typeof b.enabledPaymentTypes === 'string') patch.enabledPaymentTypes = b.enabledPaymentTypes;
	if (Number.isFinite(Number(b.minAmount))) patch.minAmount = Number(b.minAmount).toFixed(2);
	if (Number.isFinite(Number(b.maxAmount))) patch.maxAmount = Number(b.maxAmount).toFixed(2);
	await appDao.updateConfig(app.id, patch);
	return c.json({ ok: true });
});

adminGatewayRoutes.post('/payment-tests/easypay', async (c) => {
	if (!c.env.EASYPAY_BRIDGE_PID || !c.env.EASYPAY_BRIDGE_KEY) {
		return c.json({ error: 'EasyPay bridge is not configured' }, 503);
	}
	const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
	const amount = Number(body.amount);
	const paymentType = typeof body.paymentType === 'string' ? body.paymentType.trim() : '';
	const notifyUrl = typeof body.notifyUrl === 'string' ? body.notifyUrl.trim() : '';
	const returnUrl =
		typeof body.returnUrl === 'string' && body.returnUrl.trim() ? body.returnUrl.trim() : new URL('/admin', c.req.url).toString();
	if (!Number.isFinite(amount) || amount <= 0 || !['alipay', 'wxpay'].includes(paymentType)) {
		return c.json({ error: 'amount and a supported paymentType are required' }, 400);
	}
	try {
		const parsedNotifyUrl = new URL(notifyUrl);
		const parsedReturnUrl = new URL(returnUrl);
		if (!['http:', 'https:'].includes(parsedNotifyUrl.protocol) || !['http:', 'https:'].includes(parsedReturnUrl.protocol))
			throw new Error();
	} catch {
		return c.json({ error: 'Valid merchant notifyUrl and returnUrl are required' }, 400);
	}
	const externalOrderNo = `TEST_${Date.now().toString(36).toUpperCase()}_${crypto.randomUUID().slice(0, 8)}`;
	const params: Record<string, string> = {
		pid: c.env.EASYPAY_BRIDGE_PID,
		type: paymentType,
		out_trade_no: externalOrderNo,
		notify_url: notifyUrl,
		return_url: returnUrl,
		name: typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim().slice(0, 256) : '易支付兼容链路测试',
		money: amount.toFixed(2),
		clientip: c.req.header('cf-connecting-ip') || '127.0.0.1',
	};
	params.sign = sign(params, c.env.EASYPAY_BRIDGE_KEY);
	params.sign_type = 'MD5';
	const bridgeResponse = await easyPayBridgeRoutes.request(
		new URL('/mapi.php', c.req.url),
		{
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(params),
		},
		c.env,
	);
	const bridgeResult = (await bridgeResponse.json().catch(() => ({}))) as Record<string, unknown>;
	if (!bridgeResponse.ok || Number(bridgeResult.code) !== 1) {
		return c.json({ error: String(bridgeResult.msg || 'EasyPay compatibility test failed') }, bridgeResponse.status as any);
	}
	const db = createDb(c.env.DB);
	const orderDao = new OrderRepository(db);
	const order = await orderDao.findByExternalOrderNo(externalOrderNo);
	if (!order) return c.json({ error: 'Gateway order was not created' }, 500);
	return c.json({
		order: {
			...order,
			amount: Number(order.amount),
			payAmount: Number(order.payAmount),
			clientSecret: null,
			expiresAt: order.expiresAt.toISOString(),
			paidAt: order.paidAt?.toISOString() || null,
		},
		statusAccessToken: order.rechargeCode,
		protocol: { outTradeNo: externalOrderNo, tradeNo: String(bridgeResult.trade_no || order.paymentTradeNo || order.id) },
	});
});

adminGatewayRoutes.post('/payment-tests/downstream', async (c) => {
	const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
	const requestBody = {
		...body,
		notifyUrl: new URL('/api/downstream/test/notify', c.req.url).toString(),
		returnUrl: new URL('/admin', c.req.url).toString(),
		subject: typeof body.subject === 'string' ? body.subject : '下游流程测试',
	};
	return adminGatewayRoutes.fetch(
		new Request(new URL('/payment-tests/easypay', c.req.url), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(requestBody),
		}),
		c.env,
	);
});

adminGatewayRoutes.post('/refunds', async (c) => {
	const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
	const refundService = new RefundService(c.env);
	const result = await refundService.refund({
		orderId: String(b.orderId || ''),
		amount: b.amount !== undefined ? Number(b.amount) : undefined,
		reason: typeof b.reason === 'string' ? b.reason : undefined,
		requestUrl: c.req.url,
	});
	if (!result.ok) return c.json({ error: result.error }, result.status as any);
	return c.json({ ok: true, status: result.status, refundAmount: result.refundAmount });
});

adminGatewayRoutes.post('/orders/:id/retry-notification', async (c) => {
	const db = createDb(c.env.DB);
	const orderDao = new OrderRepository(db);
	const order = await orderDao.findById(c.req.param('id'));
	if (!order || !['PAID', 'RECHARGING'].includes(order.status)) return c.json({ error: 'Order is not awaiting settlement' }, 409);
	const status = await deliverPaidOrder(c.env, order, db);
	return status === 'COMPLETED' ? c.json({ ok: true, status }) : c.json({ error: 'Notification retry failed', status }, 502);
});
