// @ts-nocheck EasyPay payloads are dynamic at this protocol boundary.
import { eq, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { createDb } from '../../../db/client';
import { downstreamMerchants, orders, paymentProviderInstances } from '../../../db/schema';
import { sign } from '../../payment/downstream/easypay';
import { createManagedOrder, ManagedOrderError } from '../../services/order-service';
import { createPaymentProviders } from '../../payment/providers';
import { logBusiness } from '../../utils/business-logger';

type BridgeConfig = { id?: string; pid: string; key: string };

export const easyPayBridgeRoutes = new Hono<{ Bindings: Env }>();

async function bridgeConfig(env: Env, db: ReturnType<typeof createDb>): Promise<BridgeConfig | undefined> {
	const stored = (await db.select().from(downstreamMerchants).where(eq(downstreamMerchants.code, 'default-easypay')).limit(1))[0];
	if (stored?.enabled) return { id: stored.id, pid: stored.pid, key: stored.secret };
	const pid = env.EASYPAY_BRIDGE_PID?.trim();
	const key = env.EASYPAY_BRIDGE_KEY?.trim();
	if (pid && key) {
		const now = new Date();
		await db
			.insert(downstreamMerchants)
			.values({
				id: crypto.randomUUID(),
				code: 'default-easypay',
				protocol: 'easypay',
				pid,
				secret: key,
				enabled: true,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing();
	}
	const created =
		pid && key
			? (await db.select().from(downstreamMerchants).where(eq(downstreamMerchants.code, 'default-easypay')).limit(1))[0]
			: undefined;
	return pid && key ? { id: created?.id, pid, key } : undefined;
}

function constantTimeEqual(left: string, right: string) {
	const size = Math.max(left.length, right.length);
	let different = left.length ^ right.length;
	for (let index = 0; index < size; index += 1) different |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
	return different === 0;
}

function validHttpUrl(value: string) {
	try {
		return ['http:', 'https:'].includes(new URL(value).protocol);
	} catch {
		return false;
	}
}

function validAmount(value: string) {
	return /^\d{1,8}(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
}

function normalizeAmount(value: string) {
	return Number(value).toFixed(2);
}

async function readParams(c: any) {
	const query = Object.fromEntries(new URL(c.req.url).searchParams);
	if (c.req.method === 'GET') return query as Record<string, string>;
	const body = new TextDecoder().decode(await c.req.arrayBuffer());
	return { ...query, ...Object.fromEntries(new URLSearchParams(body)) } as Record<string, string>;
}

function verifyCreateRequest(params: Record<string, string>, config: BridgeConfig) {
	if (!constantTimeEqual(params.pid || '', config.pid)) return '商户号错误';
	if (!params.sign || !constantTimeEqual(sign(params, config.key), params.sign.toLowerCase())) return '签名校验失败';
	if ((params.sign_type || 'MD5').toUpperCase() !== 'MD5') return '仅支持 MD5 签名';
	if (!/^[A-Za-z0-9_-]{1,128}$/.test(params.out_trade_no || '')) return '商户订单号格式错误';
	if (!['alipay', 'wxpay'].includes(params.type)) return '不支持的支付方式';
	if (!validAmount(params.money || '')) return '金额格式错误';
	if (!params.name || params.name.length > 256) return '商品名称格式错误';
	if (!validHttpUrl(params.notify_url || '') || !validHttpUrl(params.return_url || '')) return '回调地址格式错误';
	return undefined;
}

function easyPayError(c: any, message: string, status = 400) {
	return c.json({ code: 0, msg: message }, status);
}

function easyPayCreateResponse(order: typeof orders.$inferSelect) {
	return {
		code: 1,
		msg: 'success',
		trade_no: order.paymentTradeNo || order.id,
		payurl: order.payUrl || '',
		payurl2: order.payUrl || '',
		qrcode: order.qrCode || '',
	};
}

async function createBridgePayment(c: any, redirect: boolean) {
	const db = createDb(c.env.DB);
	const config = await bridgeConfig(c.env, db);
	if (!config) return easyPayError(c, '易支付兼容入口未配置', 503);
	const params = await readParams(c);
	logBusiness({ action: 'CREATE_EASYPAY_ORDER', phase: '入参', payload: { ...params, redirect } });
	const validationError = verifyCreateRequest(params, config);
	if (validationError) return easyPayError(c, validationError);
	const existing = (await db.select().from(orders).where(eq(orders.externalOrderNo, params.out_trade_no)).limit(1))[0];
	if (existing) {
		if (existing.amount !== normalizeAmount(params.money) || existing.paymentType !== params.type)
			return easyPayError(c, '商户订单号已存在', 409);
		if (existing.status === 'FAILED') return easyPayError(c, existing.failedReason || '订单创建失败', 409);
		if (!existing.payUrl && !existing.qrCode) return easyPayError(c, '订单正在创建，请稍后查单', 409);
		if (redirect && !existing.payUrl) return easyPayError(c, '该渠道未返回浏览器支付地址', 422);
		const output = redirect ? { redirect: existing.payUrl } : easyPayCreateResponse(existing);
		logBusiness({ action: 'CREATE_EASYPAY_ORDER', orderId: existing.id, phase: '出参', payload: output });
		return redirect ? c.redirect(existing.payUrl, 302) : c.json(output);
	}

	try {
		const result = await createManagedOrder(c.env, c.req.url, {
			amount: Number(params.money),
			paymentType: params.type,
			userId: `merchant:${params.out_trade_no}`,
			orderType: 'easypay_bridge',
			subject: params.name,
			externalOrderNo: params.out_trade_no,
			externalNotifyUrl: params.notify_url,
			externalReturnUrl: params.return_url,
			downstreamMerchantId: config.id,
			clientIp: params.clientip,
			returnUrlForOrder: (orderId) => new URL(`/api/easypay/return/${orderId}`, c.req.url).toString(),
		});
		if (!result.order.payUrl && !result.order.qrCode) return easyPayError(c, '支付渠道未返回支付信息', 502);
		if (redirect && !result.order.payUrl) return easyPayError(c, '该渠道未返回浏览器支付地址', 422);
		const output = redirect ? { redirect: result.order.payUrl } : easyPayCreateResponse(result.order);
		logBusiness({ action: 'CREATE_EASYPAY_ORDER', orderId: result.order.id, phase: '出参', payload: output });
		return redirect ? c.redirect(result.order.payUrl, 302) : c.json(output);
	} catch (error) {
		if (error instanceof ManagedOrderError) return easyPayError(c, error.message, error.status);
		return easyPayError(c, error instanceof Error ? error.message : '创建支付订单失败', 500);
	}
}

easyPayBridgeRoutes.post('/mapi.php', (c) => createBridgePayment(c, false));
easyPayBridgeRoutes.get('/submit.php', (c) => createBridgePayment(c, true));
easyPayBridgeRoutes.post('/submit.php', (c) => createBridgePayment(c, true));

easyPayBridgeRoutes.all('/api.php', async (c) => {
	const db = createDb(c.env.DB);
	const config = await bridgeConfig(c.env, db);
	if (!config) return easyPayError(c, '易支付兼容入口未配置', 503);
	const params = await readParams(c);
	if (!constantTimeEqual(params.pid || '', config.pid) || !constantTimeEqual(params.key || '', config.key)) {
		return easyPayError(c, '商户验证失败', 401);
	}
	const reference = params.out_trade_no || params.trade_no || '';
	const order = (
		await db
			.select()
			.from(orders)
			.where(or(eq(orders.externalOrderNo, reference), eq(orders.paymentTradeNo, reference), eq(orders.id, reference)))
			.limit(1)
	)[0];
	if (!order || order.orderType !== 'easypay_bridge') return easyPayError(c, '订单编号不存在');
	if (params.act === 'order') {
		const paid = ['PAID', 'RECHARGING', 'COMPLETED', 'REFUNDED'].includes(order.status);
		return c.json({
			code: 1,
			msg: 'success',
			trade_status: paid ? 'TRADE_SUCCESS' : order.status,
			status: paid ? 1 : 0,
			money: order.amount,
			trade_no: order.paymentTradeNo || order.id,
			out_trade_no: order.externalOrderNo,
		});
	}
	if (params.act !== 'refund') return easyPayError(c, '不支持的操作');
	if (order.status === 'REFUNDED') return c.json({ code: 1, msg: 'success' });
	if (!['PAID', 'RECHARGING', 'COMPLETED'].includes(order.status)) return easyPayError(c, '订单未支付');
	if (!validAmount(params.money || '') || normalizeAmount(params.money) !== order.amount) return easyPayError(c, '虎皮椒仅支持整单退款');
	const instance = order.providerInstanceId
		? (await db.select().from(paymentProviderInstances).where(eq(paymentProviderInstances.id, order.providerInstanceId)).limit(1))[0]
		: undefined;
	if (!instance) return easyPayError(c, '支付渠道不存在', 503);
	const provider = createPaymentProviders([instance], c.req.url).easyPay;
	if (!provider?.refund) return easyPayError(c, '该支付渠道不支持易支付退款', 422);
	try {
		await provider.refund(order.paymentTradeNo || order.id, order.id, Number(order.amount));
		await db
			.update(orders)
			.set({ status: 'REFUNDED', paymentStatus: 'REFUNDED', refundAmount: order.amount, refundAt: new Date(), updatedAt: new Date() })
			.where(eq(orders.id, order.id));
		return c.json({ code: 1, msg: 'success' });
	} catch (error) {
		return easyPayError(c, error instanceof Error ? error.message : '退款失败', 502);
	}
});

easyPayBridgeRoutes.get('/return/:orderId', async (c) => {
	const db = createDb(c.env.DB);
	const config = await bridgeConfig(c.env, db);
	if (!config) return c.text('EasyPay bridge is not configured', 503);
	const order = (
		await db
			.select()
			.from(orders)
			.where(eq(orders.id, c.req.param('orderId')))
			.limit(1)
	)[0];
	if (!order || order.orderType !== 'easypay_bridge' || !order.externalOrderNo || !validHttpUrl(order.externalReturnUrl || '')) {
		return c.text('Order not found', 404);
	}
	const paid = ['PAID', 'RECHARGING', 'COMPLETED', 'REFUNDED'].includes(order.status);
	const params: Record<string, string> = {
		pid: config.pid,
		type: order.paymentType,
		out_trade_no: order.externalOrderNo,
		trade_no: order.paymentTradeNo || order.id,
		name: order.subject,
		money: order.amount,
		trade_status: paid ? 'TRADE_SUCCESS' : order.status,
	};
	params.sign = sign(params, config.key);
	params.sign_type = 'MD5';
	const target = new URL(order.externalReturnUrl);
	for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
	return c.redirect(target.toString(), 302);
});
