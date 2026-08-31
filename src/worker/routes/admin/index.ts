import { Hono } from 'hono';
import { AdminService } from '../../services/admin-service';
import { sign } from '../../payment/downstream/easypay';
import { easyPayBridgeRoutes } from '../downstream/easypay';

export const adminGatewayRoutes = new Hono<{ Bindings: Env }>();

const adminService = (env: Env) => new AdminService(env);

adminGatewayRoutes.get('/dashboard', async (c) => {
	const result = await adminService(c.env).dashboard();
	return c.json(result);
});

adminGatewayRoutes.get('/payment-tests/config', async (c) => {
	const result = await adminService(c.env).paymentTestConfig();
	if (!result) return c.json({ error: 'default app not found' }, 404);
	return c.json(result);
});

adminGatewayRoutes.get('/payment-tests/orders/:id', async (c) => {
	const row = await adminService(c.env).findOrder(c.req.param('id'));
	if (!row) return c.json({ error: 'Order not found' }, 404);
	return c.json({ order: { ...row, amount: Number(row.amount), payAmount: Number(row.payAmount), expiresAt: row.expiresAt.toISOString(), paidAt: row.paidAt?.toISOString() || null } });
});

adminGatewayRoutes.post('/payment-tests/orders/:id/cancel', async (c) => {
	const cancelled = await adminService(c.env).cancelOrder(c.req.param('id'));
	if (!cancelled) return c.json({ error: 'Only pending orders can be cancelled' }, 409);
	return c.json({ status: 'CANCELLED' });
});

adminGatewayRoutes.get('/apps', async (c) => c.json({ apps: await adminService(c.env).listApps() }));

adminGatewayRoutes.get('/apps/:id', async (c) => {
	const result = await adminService(c.env).getApp(c.req.param('id'));
	if (!result) return c.json({ error: 'App not found' }, 404);
	return c.json(result);
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
	const page = Math.max(1, Number(c.req.query('page')) || 1);
	const pageSize = Math.min(500, Math.max(1, Number(c.req.query('page_size') || c.req.query('limit')) || 50));
	const { rows, total } = await adminService(c.env).listOrders({ status: c.req.query('status'), paymentType: c.req.query('payment_type'), userId: c.req.query('user_id'), page, pageSize });
	return c.json({ orders: rows, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
});

adminGatewayRoutes.get('/providers', async (c) => {
	const rows = await adminService(c.env).listProviders();
	return c.json({ providers: rows.map(({ config: _config, ...provider }) => provider) });
});

adminGatewayRoutes.get('/providers/:id', async (c) => {
	const result = await adminService(c.env).getProvider(c.req.param('id'));
	if (!result) return c.json({ error: 'Provider not found' }, 404);
	return c.json(result);
});

adminGatewayRoutes.post('/providers', async (c) => {
	const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
	const name = String(b.name || '').trim();
	const providerKey = String(b.providerKey || '').trim();
	if (!name || !providerKey) return c.json({ error: 'providerKey and name are required' }, 400);
	const provider = await adminService(c.env).createProvider({
		name, providerKey, config: typeof b.config === 'string' ? b.config : JSON.stringify(b.config || {}),
		supportedTypes: String(b.supportedTypes || ''), enabled: b.enabled !== false, sortOrder: Number(b.sortOrder) || 0, refundEnabled: b.refundEnabled === true,
	});
	if (!provider) return c.json({ error: 'default app not found' }, 404);
	return c.json({ provider }, 201);
});

adminGatewayRoutes.put('/config', async (c) => {
	const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (typeof b.enabledPaymentTypes === 'string') patch.enabledPaymentTypes = b.enabledPaymentTypes;
	if (Number.isFinite(Number(b.minAmount))) patch.minAmount = Number(b.minAmount).toFixed(2);
	if (Number.isFinite(Number(b.maxAmount))) patch.maxAmount = Number(b.maxAmount).toFixed(2);
	if (!await adminService(c.env).updateDefaultConfig(patch)) return c.json({ error: 'default app not found' }, 404);
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
	const result = await adminService(c.env).refund({
		orderId: String(b.orderId || ''),
		amount: b.amount !== undefined ? Number(b.amount) : undefined,
		reason: typeof b.reason === 'string' ? b.reason : undefined,
		requestUrl: c.req.url,
	});
	if (!result.ok) return c.json({ error: result.error }, result.status as any);
	return c.json({ ok: true, status: result.status, refundAmount: result.refundAmount });
});

adminGatewayRoutes.post('/orders/:id/retry-notification', async (c) => {
	const status = await adminService(c.env).retryNotification(c.req.param('id'));
	if (!status) return c.json({ error: 'Order is not awaiting settlement' }, 409);
	return status === 'COMPLETED' ? c.json({ ok: true, status }) : c.json({ error: 'Notification retry failed', status }, 502);
});
