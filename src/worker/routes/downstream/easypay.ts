// EasyPay protocol payloads are handled at this route boundary.
import { Hono } from 'hono';
import { createEasyPayService, EasyPayService } from '../../services/easypay-service';
import { ManagedOrderError } from '../../services/order-service';
import { logBusiness } from '../../utils/business-logger';
import type { WorkerEnv } from '../../types';

export const easyPayBridgeRoutes = new Hono<WorkerEnv>();

async function readParams(c: any) {
	const query = Object.fromEntries(new URL(c.req.url).searchParams);
	if (c.req.method === 'GET') return query as Record<string, string>;
	const body = new TextDecoder().decode(await c.req.arrayBuffer());
	return { ...query, ...Object.fromEntries(new URLSearchParams(body)) } as Record<string, string>;
}

function easyPayError(c: any, message: string, status = 400) {
	return c.json({ code: 0, msg: message }, status);
}

function easyPayCreateResponse(order: any) {
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
	const service = createEasyPayService(c.env);
	const config = await service.bridgeConfig();
	if (!config) return easyPayError(c, '易支付兼容入口未配置', 503);
	const params = await readParams(c);
	logBusiness({ message: '创建易支付订单开始', payload: { ...params, redirect } });
	const validationError = service.validateCreateRequest(params, config);
	if (validationError) return easyPayError(c, validationError);
	const existing = await service.findExisting(params.out_trade_no);
	if (existing) {
		if (existing.amount !== EasyPayService.normalizeAmount(params.money) || existing.paymentType !== params.type)
			return easyPayError(c, '商户订单号已存在', 409);
		if (existing.status === 'FAILED') return easyPayError(c, existing.failedReason || '订单创建失败', 409);
		if (!existing.payUrl && !existing.qrCode) return easyPayError(c, '订单正在创建，请稍后查单', 409);
		if (redirect && !existing.payUrl) return easyPayError(c, '该渠道未返回浏览器支付地址', 422);
		const output = redirect ? { redirect: existing.payUrl } : easyPayCreateResponse(existing);
		logBusiness({ message: `创建易支付订单完成，orderId：${existing.id}`, payload: output });
		return redirect ? c.redirect(existing.payUrl, 302) : c.json(output);
	}

	try {
		const result = await service.createOrder(c.req.url, params, config);
		if (!result.order.payUrl && !result.order.qrCode) return easyPayError(c, '支付渠道未返回支付信息', 502);
		if (redirect && !result.order.payUrl) return easyPayError(c, '该渠道未返回浏览器支付地址', 422);
		const output = redirect ? { redirect: result.order.payUrl } : easyPayCreateResponse(result.order);
		logBusiness({ message: `创建易支付订单完成，orderId：${result.order.id}`, payload: output });
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
	const service = createEasyPayService(c.env);
	const config = await service.bridgeConfig();
	if (!config) return easyPayError(c, '易支付兼容入口未配置', 503);
	const params = await readParams(c);
	if (!service.verifyMerchant(params.pid, params.key, config)) {
		return easyPayError(c, '商户验证失败', 401);
	}
	try {
		const result = await service.queryOrRefund(params, config);
		if (result.kind === 'order') {
			const paid = ['PAID', 'RECHARGING', 'COMPLETED', 'REFUNDED'].includes(result.order.status);
			return c.json({
				code: 1,
				msg: 'success',
				trade_status: paid ? 'TRADE_SUCCESS' : result.order.status,
				status: paid ? 1 : 0,
				money: result.order.amount,
				trade_no: result.order.paymentTradeNo || result.order.id,
				out_trade_no: result.order.externalOrderNo,
			});
		}
		return c.json({ code: 1, msg: 'success' });
	} catch (error) {
		if (error instanceof ManagedOrderError) return easyPayError(c, error.message, error.status);
		return easyPayError(c, error instanceof Error ? error.message : '操作失败', 500);
	}
});

easyPayBridgeRoutes.get('/return/:orderId', async (c) => {
	const service = createEasyPayService(c.env);
	const config = await service.bridgeConfig();
	if (!config) return c.text('EasyPay bridge is not configured', 503);
	const order = await service.findOrderById(c.req.param('orderId'));
	if (!order || order.orderType !== 'easypay_bridge' || !order.externalOrderNo || !EasyPayService.validHttpUrl(order.externalReturnUrl || '')) {
		return c.text('Order not found', 404);
	}
	const returnUrl = order.externalReturnUrl || '';
	const params = service.buildReturnParams(order, config);
	const target = new URL(returnUrl);
	for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
	return c.redirect(target.toString(), 302);
});
