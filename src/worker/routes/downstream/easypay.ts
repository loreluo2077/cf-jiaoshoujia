import { Hono } from 'hono';
import { createEasyPayService, EasyPayService } from '../../services/easypay-service';
import { ManagedOrderError } from '../../services/order-service';
import { log } from '../../utils/controller-logger';
import type { WorkerEnv } from '../../types';

export const easyPayBridgeRoutes = new Hono<WorkerEnv>();

const getService = (env: Env) => createEasyPayService(env);

async function readParams(c: any) {
	const query = Object.fromEntries(new URL(c.req.url).searchParams);
	if (c.req.method === 'GET') return query as Record<string, string>;
	const body = new TextDecoder().decode(await c.req.arrayBuffer());
	return { ...query, ...Object.fromEntries(new URLSearchParams(body)) } as Record<string, string>;
}

const errorResponses = {
	NOT_CONFIGURED: { code: 0, msg: '易支付兼容入口未配置', status: 503 },
	VALIDATION_ERROR: { code: 0, msg: '', status: 400 },
	ORDER_EXISTS: { code: 0, msg: '商户订单号已存在', status: 409 },
	ORDER_FAILED: { code: 0, msg: '', status: 409 },
	ORDER_CREATING: { code: 0, msg: '订单正在创建，请稍后查单', status: 409 },
	NO_BROWSER_URL: { code: 0, msg: '该渠道未返回浏览器支付地址', status: 422 },
	NO_PAYMENT_INFO: { code: 0, msg: '支付渠道未返回支付信息', status: 502 },
	MERCHANT_VERIFY_FAILED: { code: 0, msg: '商户验证失败', status: 401 },
	OPERATION_FAILED: { code: 0, msg: '', status: 500 },
} as const;

function respondError(c: any, errorKey: keyof typeof errorResponses, customMsg?: string) {
	const error = errorResponses[errorKey];
	return c.json({ code: error.code, msg: customMsg || error.msg }, error.status as any);
}

function respondSuccess(order: any) {
	return {
		code: 1,
		msg: 'success',
		trade_no: order.paymentTradeNo || order.id,
		payurl: order.payUrl || '',
		payurl2: order.payUrl || '',
		qrcode: order.qrCode || '',
	};
}

async function handleCreatePayment(c: any, redirect: boolean) {
	const requestId = c.get('requestId');
	log('EasyPayController', '入参', requestId, { redirect, method: c.req.method });

	const service = getService(c.env);
	const config = await service.bridgeConfig();
	if (!config) {
		log('EasyPayController', '出参', requestId, { error: 'NOT_CONFIGURED' });
		return respondError(c, 'NOT_CONFIGURED');
	}

	const params = await readParams(c);
	const validationError = service.validateCreateRequest(params, config);
	if (validationError) {
		log('EasyPayController', '出参', requestId, { error: 'VALIDATION_ERROR', detail: validationError });
		return respondError(c, 'VALIDATION_ERROR', validationError);
	}

	const existing = await service.findExisting(params.out_trade_no);
	if (existing) {
		if (existing.amount !== EasyPayService.normalizeAmount(params.money) || existing.paymentType !== params.type) {
			log('EasyPayController', '出参', requestId, { error: 'ORDER_EXISTS' });
			return respondError(c, 'ORDER_EXISTS');
		}
		if (existing.status === 'FAILED') {
			log('EasyPayController', '出参', requestId, { error: 'ORDER_FAILED' });
			return respondError(c, 'ORDER_FAILED', existing.failedReason || '订单创建失败');
		}
		if (!existing.payUrl && !existing.qrCode) {
			log('EasyPayController', '出参', requestId, { error: 'ORDER_CREATING' });
			return respondError(c, 'ORDER_CREATING');
		}
		if (redirect && !existing.payUrl) {
			log('EasyPayController', '出参', requestId, { error: 'NO_BROWSER_URL' });
			return respondError(c, 'NO_BROWSER_URL');
		}

		log('EasyPayController', '出参', requestId, { orderId: existing.id, redirect });
		return redirect ? c.redirect(existing.payUrl, 302) : c.json(respondSuccess(existing));
	}

	try {
		const result = await service.createOrder(c.req.url, params, config);
		if (!result.order.payUrl && !result.order.qrCode) {
			log('EasyPayController', '出参', requestId, { error: 'NO_PAYMENT_INFO' });
			return respondError(c, 'NO_PAYMENT_INFO');
		}
		if (redirect && !result.order.payUrl) {
			log('EasyPayController', '出参', requestId, { error: 'NO_BROWSER_URL' });
			return respondError(c, 'NO_BROWSER_URL');
		}

		log('EasyPayController', '出参', requestId, { orderId: result.order.id, redirect });
		return redirect ? c.redirect(result.order.payUrl, 302) : c.json(respondSuccess(result.order));
	} catch (error) {
		if (error instanceof ManagedOrderError) {
			log('EasyPayController', '出参', requestId, { error: 'MANAGED_ERROR', detail: error.message });
			return c.json({ code: 0, msg: error.message }, error.status as any);
		}
		const msg = error instanceof Error ? error.message : '创建支付订单失败';
		log('EasyPayController', '出参', requestId, { error: 'OPERATION_FAILED', detail: msg });
		return respondError(c, 'OPERATION_FAILED', msg);
	}
}

easyPayBridgeRoutes.post('/mapi.php', (c) => handleCreatePayment(c, false));
easyPayBridgeRoutes.get('/submit.php', (c) => handleCreatePayment(c, true));
easyPayBridgeRoutes.post('/submit.php', (c) => handleCreatePayment(c, true));

easyPayBridgeRoutes.all('/api.php', async (c) => {
	const requestId = c.get('requestId');
	log('EasyPayController', '入参', requestId, { path: '/api.php' });

	const service = getService(c.env);
	const config = await service.bridgeConfig();
	if (!config) {
		log('EasyPayController', '出参', requestId, { error: 'NOT_CONFIGURED' });
		return respondError(c, 'NOT_CONFIGURED');
	}

	const params = await readParams(c);
	if (!service.verifyMerchant(params.pid, params.key, config)) {
		log('EasyPayController', '出参', requestId, { error: 'MERCHANT_VERIFY_FAILED' });
		return respondError(c, 'MERCHANT_VERIFY_FAILED');
	}

	try {
		const result = await service.queryOrRefund(params, config);
		if (result.kind === 'order') {
			const paid = ['PAID', 'RECHARGING', 'COMPLETED', 'REFUNDED'].includes(result.order.status);
			log('EasyPayController', '出参', requestId, { orderId: result.order.id, paid });
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
		log('EasyPayController', '出参', requestId, { kind: result.kind });
		return c.json({ code: 1, msg: 'success' });
	} catch (error) {
		if (error instanceof ManagedOrderError) {
			log('EasyPayController', '出参', requestId, { error: 'MANAGED_ERROR', detail: error.message });
			return c.json({ code: 0, msg: error.message }, error.status as any);
		}
		const msg = error instanceof Error ? error.message : '操作失败';
		log('EasyPayController', '出参', requestId, { error: 'OPERATION_FAILED', detail: msg });
		return respondError(c, 'OPERATION_FAILED', msg);
	}
});

easyPayBridgeRoutes.get('/return/:orderId', async (c) => {
	const requestId = c.get('requestId');
	const orderId = c.req.param('orderId');
	log('EasyPayController', '入参', requestId, { path: '/return', orderId });

	const service = getService(c.env);
	const config = await service.bridgeConfig();
	if (!config) {
		log('EasyPayController', '出参', requestId, { error: 'NOT_CONFIGURED' });
		return c.text('EasyPay bridge is not configured', 503 as any);
	}

	const order = await service.findOrderById(orderId);
	if (!order || order.orderType !== 'easypay_bridge' || !order.externalOrderNo || !EasyPayService.validHttpUrl(order.externalReturnUrl || '')) {
		log('EasyPayController', '出参', requestId, { error: 'ORDER_NOT_FOUND' });
		return c.text('Order not found', 404 as any);
	}

	const returnUrl = order.externalReturnUrl || '';
	const params = service.buildReturnParams(order, config);
	const target = new URL(returnUrl);
	for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);

	log('EasyPayController', '出参', requestId, { orderId, redirect: true });
	return c.redirect(target.toString(), 302);
});
