import { Hono } from 'hono';
import { createEasyPayService } from '../../services/easypay-service';
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

const errorMessages = {
	NOT_CONFIGURED: '易支付兼容入口未配置',
	VALIDATION_ERROR: '',
	ORDER_EXISTS: '商户订单号已存在',
	ORDER_FAILED: '订单创建失败',
	ORDER_CREATING: '订单正在创建，请稍后查单',
	NO_BROWSER_URL: '该渠道未返回浏览器支付地址',
	NO_PAYMENT_INFO: '支付渠道未返回支付信息',
	MERCHANT_VERIFY_FAILED: '商户验证失败',
	MANAGED_ERROR: '',
	OPERATION_FAILED: '操作失败',
	ORDER_NOT_FOUND: 'Order not found',
} as const;

const errorStatus = {
	NOT_CONFIGURED: 503,
	VALIDATION_ERROR: 400,
	ORDER_EXISTS: 409,
	ORDER_FAILED: 409,
	ORDER_CREATING: 409,
	NO_BROWSER_URL: 422,
	NO_PAYMENT_INFO: 502,
	MERCHANT_VERIFY_FAILED: 401,
	MANAGED_ERROR: 500,
	OPERATION_FAILED: 500,
	ORDER_NOT_FOUND: 404,
} as const;

async function handleCreatePayment(c: any, redirect: boolean) {
	const requestId = c.get('requestId');
	log('EasyPayController', '入参', requestId, { redirect, method: c.req.method });

	const params = await readParams(c);
	const result = await getService(c.env).handleCreatePayment(c.req.url, params, redirect);

	if (!result.ok) {
		const message = result.message || errorMessages[result.code];
		const status = errorStatus[result.code];
		log('EasyPayController', '出参', requestId, { error: result.code });
		return c.json({ code: 0, msg: message }, status as any);
	}

	log('EasyPayController', '出参', requestId, { orderId: result.order.id, redirect });

	if (redirect && result.redirect) {
		return c.redirect(result.redirect, 302);
	}

	return c.json({
		code: 1,
		msg: 'success',
		trade_no: result.order.paymentTradeNo || result.order.id,
		payurl: result.order.payUrl || '',
		payurl2: result.order.payUrl || '',
		qrcode: result.order.qrCode || '',
	});
}

easyPayBridgeRoutes.post('/mapi.php', (c) => handleCreatePayment(c, false));
easyPayBridgeRoutes.get('/submit.php', (c) => handleCreatePayment(c, true));
easyPayBridgeRoutes.post('/submit.php', (c) => handleCreatePayment(c, true));

easyPayBridgeRoutes.all('/api.php', async (c) => {
	const requestId = c.get('requestId');
	log('EasyPayController', '入参', requestId, { path: '/api.php' });

	const params = await readParams(c);
	const result = await getService(c.env).handleQueryOrRefund(params);

	if (!result.ok) {
		const message = result.message || errorMessages[result.code as keyof typeof errorMessages];
		const status = 'status' in result ? result.status : errorStatus[result.code as keyof typeof errorStatus];
		log('EasyPayController', '出参', requestId, { error: result.code });
		return c.json({ code: 0, msg: message }, status as any);
	}

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
});

easyPayBridgeRoutes.get('/return/:orderId', async (c) => {
	const requestId = c.get('requestId');
	const orderId = c.req.param('orderId');
	log('EasyPayController', '入参', requestId, { path: '/return', orderId });

	const result = await getService(c.env).handleReturn(orderId);

	if (!result.ok) {
		log('EasyPayController', '出参', requestId, { error: result.code });
		const status = errorStatus[result.code];
		return c.text(result.message, status as any);
	}

	log('EasyPayController', '出参', requestId, { orderId, redirect: true });
	return c.redirect(result.redirectUrl, 302);
});
