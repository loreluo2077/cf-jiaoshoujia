import { Hono } from 'hono';
import { AdminService } from '../../services/admin-service';
import { EasyPayService } from '../../services/easypay-service';
import { easyPayBridgeRoutes } from '../app/sub2api';
import { log } from '../../utils/controller-logger';
import type { WorkerEnv } from '../../types';
import { badRequest, notFound, serviceUnavailable } from '../../errors/http';

export const adminGatewayRoutes = new Hono<WorkerEnv>();

const getService = (env: Env) => new AdminService(env);

adminGatewayRoutes.get('/dashboard', async (c) => {
	log('AdminController', '入参', c.get('requestId'), { path: '/dashboard' });
	const result = await getService(c.env).dashboard();
	log('AdminController', '出参', c.get('requestId'), result);
	return c.json(result);
});

adminGatewayRoutes.get('/payment-tests/config', async (c) => {
	log('AdminController', '入参', c.get('requestId'), { path: '/payment-tests/config' });
	const result = await getService(c.env).paymentTestConfig();
	if (!result) {
		log('AdminController', '出参', c.get('requestId'), { error: 'APP_NOT_FOUND' });
		throw notFound('default app not found');
	}
	log('AdminController', '出参', c.get('requestId'), { found: true });
	return c.json(result);
});

adminGatewayRoutes.get('/payment-tests/orders/:id', async (c) => {
	const id = c.req.param('id');
	log('AdminController', '入参', c.get('requestId'), { id: { present: id.length > 0 } });
	const row = await getService(c.env).findOrder(id);
	if (!row) {
		log('AdminController', '出参', c.get('requestId'), { error: 'ORDER_NOT_FOUND' });
		throw notFound('Order not found');
	}
	log('AdminController', '出参', c.get('requestId'), { found: true });
	return c.json({ order: { ...row, amount: Number(row.amount), payAmount: Number(row.payAmount), expiresAt: row.expiresAt.toISOString(), paidAt: row.paidAt?.toISOString() || null } });
});

adminGatewayRoutes.post('/payment-tests/orders/:id/cancel', async (c) => {
	const id = c.req.param('id');
	log('AdminController', '入参', c.get('requestId'), { id: { present: id.length > 0 } });
	const cancelled = await getService(c.env).cancelOrder(id);
	if (!cancelled) {
		log('AdminController', '出参', c.get('requestId'), { error: 'ORDER_STATE_CONFLICT' });
		return c.json({ error: 'Only pending orders can be cancelled' }, 409);
	}
	log('AdminController', '出参', c.get('requestId'), { status: 'CANCELLED' });
	return c.json({ status: 'CANCELLED' });
});

adminGatewayRoutes.get('/orders', async (c) => {
	const page = Math.max(1, Number(c.req.query('page')) || 1);
	const pageSize = Math.min(500, Math.max(1, Number(c.req.query('page_size') || c.req.query('limit')) || 50));
	log('AdminController', '入参', c.get('requestId'), { page, pageSize, filters: { status: c.req.query('status'), paymentType: c.req.query('payment_type') } });
	const { rows, total } = await getService(c.env).listOrders({ status: c.req.query('status'), paymentType: c.req.query('payment_type'), userId: c.req.query('user_id'), page, pageSize });
	log('AdminController', '出参', c.get('requestId'), { count: rows.length, total });
	return c.json({ orders: rows, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
});

adminGatewayRoutes.get('/providers', async (c) => {
	log('AdminController', '入参', c.get('requestId'), { path: '/providers' });
	const rows = await getService(c.env).listProviders();
	log('AdminController', '出参', c.get('requestId'), { count: rows.length });
	return c.json({ providers: rows.map(({ config: _config, ...provider }) => provider) });
});

adminGatewayRoutes.get('/providers/:id', async (c) => {
	const id = c.req.param('id');
	log('AdminController', '入参', c.get('requestId'), { id: { present: id.length > 0 } });
	const result = await getService(c.env).getProvider(id);
	if (!result) {
		log('AdminController', '出参', c.get('requestId'), { error: 'PROVIDER_NOT_FOUND' });
		throw notFound('Provider not found');
	}
	log('AdminController', '出参', c.get('requestId'), { found: true });
	return c.json(result);
});

adminGatewayRoutes.patch('/providers/:id', async (c) => {
	const id = c.req.param('id');
	log('AdminController', '入参', c.get('requestId'), { id: { present: id.length > 0 } });
	const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim();
	if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
	if (typeof b.refundEnabled === 'boolean') patch.refundEnabled = b.refundEnabled;
	if (typeof b.supportedTypes === 'string') patch.supportedTypes = b.supportedTypes;
	if (Number.isFinite(Number(b.sortOrder))) patch.sortOrder = Number(b.sortOrder);
	if (typeof b.config === 'object' || typeof b.config === 'string') {
		patch.config = typeof b.config === 'string' ? b.config : JSON.stringify(b.config);
	}
	await getService(c.env).updateProvider(id, patch);
	log('AdminController', '出参', c.get('requestId'), { ok: true });
	return c.json({ ok: true });
});

adminGatewayRoutes.delete('/providers/:id', async (c) => {
	const id = c.req.param('id');
	log('AdminController', '入参', c.get('requestId'), { id: { present: id.length > 0 } });
	const result = await getService(c.env).deleteProvider(id);
	if (result.kind === 'missing') {
		log('AdminController', '出参', c.get('requestId'), { error: 'PROVIDER_NOT_FOUND' });
		throw notFound('Provider not found');
	}
	if (result.kind === 'has-orders') {
		log('AdminController', '出参', c.get('requestId'), { error: 'HAS_ORDERS' });
		return c.json({ error: 'Cannot delete provider with existing orders' }, 409);
	}
	log('AdminController', '出参', c.get('requestId'), { deleted: true });
	return c.json({ ok: true });
});

adminGatewayRoutes.post('/providers', async (c) => {
	const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
	const name = String(b.name || '').trim();
	const providerKey = String(b.providerKey || '').trim();
	log('AdminController', '入参', c.get('requestId'), { name: { present: name.length > 0 }, providerKey: { present: providerKey.length > 0 } });
	if (!name || !providerKey) {
		log('AdminController', '出参', c.get('requestId'), { error: 'VALIDATION_ERROR' });
		throw badRequest('providerKey and name are required');
	}
	const provider = await getService(c.env).createProvider({
		name, providerKey, config: typeof b.config === 'string' ? b.config : JSON.stringify(b.config || {}),
		supportedTypes: String(b.supportedTypes || ''), enabled: b.enabled !== false, sortOrder: Number(b.sortOrder) || 0, refundEnabled: b.refundEnabled === true,
	});
	if (!provider) {
		log('AdminController', '出参', c.get('requestId'), { error: 'APP_NOT_FOUND' });
		throw notFound('default app not found');
	}
	log('AdminController', '出参', c.get('requestId'), { created: true });
	return c.json({ provider }, 201);
});

adminGatewayRoutes.put('/config', async (c) => {
	log('AdminController', '入参', c.get('requestId'), { path: '/config' });
	const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (typeof b.enabledPaymentTypes === 'string') patch.enabledPaymentTypes = b.enabledPaymentTypes;
	if (Number.isFinite(Number(b.minAmount))) patch.minAmount = Number(b.minAmount).toFixed(2);
	if (Number.isFinite(Number(b.maxAmount))) patch.maxAmount = Number(b.maxAmount).toFixed(2);
	if (!await getService(c.env).updateDefaultConfig(patch)) {
		log('AdminController', '出参', c.get('requestId'), { error: 'APP_NOT_FOUND' });
		throw notFound('default app not found');
	}
	log('AdminController', '出参', c.get('requestId'), { ok: true });
	return c.json({ ok: true });
});

adminGatewayRoutes.post('/payment-tests/easypay', async (c) => {
	log('AdminController', '入参', c.get('requestId'), { path: '/payment-tests/easypay' });
	if (!c.env.EASYPAY_BRIDGE_PID || !c.env.EASYPAY_BRIDGE_KEY) {
		log('AdminController', '出参', c.get('requestId'), { error: 'BRIDGE_NOT_CONFIGURED' });
		throw serviceUnavailable('EasyPay bridge is not configured');
	}
	const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
	const amount = Number(body.amount);
	const paymentType = typeof body.paymentType === 'string' ? body.paymentType.trim() : '';
	const notifyUrl = typeof body.notifyUrl === 'string' ? body.notifyUrl.trim() : '';
	const returnUrl =
		typeof body.returnUrl === 'string' && body.returnUrl.trim() ? body.returnUrl.trim() : new URL('/admin', c.req.url).toString();
	if (!Number.isFinite(amount) || amount <= 0 || !['alipay', 'wxpay'].includes(paymentType)) {
		log('AdminController', '出参', c.get('requestId'), { error: 'VALIDATION_ERROR' });
		throw badRequest('amount and a supported paymentType are required');
	}
	try {
		const parsedNotifyUrl = new URL(notifyUrl);
		const parsedReturnUrl = new URL(returnUrl);
		if (!['http:', 'https:'].includes(parsedNotifyUrl.protocol) || !['http:', 'https:'].includes(parsedReturnUrl.protocol))
			throw new Error();
	} catch {
		log('AdminController', '出参', c.get('requestId'), { error: 'VALIDATION_ERROR' });
		throw badRequest('Valid merchant notifyUrl and returnUrl are required');
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
	params.sign = EasyPayService.sign(params, c.env.EASYPAY_BRIDGE_KEY);
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
		log('AdminController', '出参', c.get('requestId'), { error: 'BRIDGE_FAILED' });
		return c.json({ error: String(bridgeResult.msg || 'EasyPay compatibility test failed') }, bridgeResponse.status as any);
	}
	const order = await getService(c.env).findOrderByExternalNo(externalOrderNo);
	if (!order) {
		log('AdminController', '出参', c.get('requestId'), { error: 'ORDER_NOT_CREATED' });
		return c.json({ error: 'Gateway order was not created' }, 500);
	}
	log('AdminController', '出参', c.get('requestId'), { orderId: order.id, created: true });
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
	log('AdminController', '入参', c.get('requestId'), { path: '/payment-tests/downstream' });
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
	log('AdminController', '入参', c.get('requestId'), { orderId: typeof b.orderId === 'string' ? { present: true } : { present: false } });
	const result = await getService(c.env).refund({
		orderId: String(b.orderId || ''),
		amount: b.amount !== undefined ? Number(b.amount) : undefined,
		reason: typeof b.reason === 'string' ? b.reason : undefined,
		requestUrl: c.req.url,
	});
	if (result.ok) {
		log('AdminController', '出参', c.get('requestId'), { ok: true, status: result.status });
		return c.json({ ok: true, status: result.status, refundAmount: result.refundAmount });
	}
	log('AdminController', '出参', c.get('requestId'), { error: result.error });
	return c.json({ error: result.error }, result.status as any);
});

adminGatewayRoutes.get('/refunds', async (c) => {
	const page = Math.max(1, Number(c.req.query('page')) || 1);
	const pageSize = Math.min(500, Math.max(1, Number(c.req.query('page_size')) || 50));
	const result = await getService(c.env).listRefunds({ status: c.req.query('status'), page, pageSize });
	return c.json({ refunds: result.rows, pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) } });
});

adminGatewayRoutes.post('/orders/:id/retry-notification', async (c) => {
	const id = c.req.param('id');
	log('AdminController', '入参', c.get('requestId'), { id: { present: id.length > 0 } });
	const status = await getService(c.env).retryNotification(id);
	if (!status) {
		log('AdminController', '出参', c.get('requestId'), { error: 'ORDER_STATE_CONFLICT' });
		return c.json({ error: 'Order is not awaiting settlement' }, 409);
	}
	log('AdminController', '出参', c.get('requestId'), { status });
	return status === 'COMPLETED' ? c.json({ ok: true, status }) : c.json({ error: 'Notification retry failed', status }, 502);
});
