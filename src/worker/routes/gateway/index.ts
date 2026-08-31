import { Hono, type Context } from 'hono';
import { GATEWAY_PROVIDER, GATEWAY_RESULT_CODE, type GatewayProvider, type GatewayResult } from '../../dto/gateway.dto';
import { GatewayService } from '../../services/gateway-service';
import { log } from '../../utils/controller-logger';
import type { WorkerEnv } from '../../types';

export const gatewayRoutes = new Hono<WorkerEnv>();

type GatewayContext = Context<WorkerEnv>;

const HTTP_STATUS = {
	BAD_REQUEST: 400,
	NOT_FOUND: 404,
	SERVICE_UNAVAILABLE: 503,
} as const;

gatewayRoutes.post('/notify/xunhupay', (c) => handleCallback(c, GATEWAY_PROVIDER.XUNHUPAY));

gatewayRoutes.post('/notify/alipay', (c) => handleCallback(c, GATEWAY_PROVIDER.ALIPAY));
gatewayRoutes.post('/notify/wxpay', (c) => handleCallback(c, GATEWAY_PROVIDER.WXPAY));
gatewayRoutes.post('/notify/stripe', (c) => handleCallback(c, GATEWAY_PROVIDER.STRIPE));

async function handleCallback(c: GatewayContext, provider: GatewayProvider) {
	const body = await c.req.text();
	const requestId = c.get('requestId');
	log('GatewayController', '入参', requestId, {
		provider:  provider,
		contentTypePresent: Boolean(c.req.header('content-type')),
		contentLength: new TextEncoder().encode(body).byteLength,
	});
	if (!body.trim()) {
		log('GatewayController', '出参', requestId, { result: "body is empty" });
		return respond(c, provider, { code: GATEWAY_RESULT_CODE.INVALID_NOTIFICATION });
	}
	const result = await new GatewayService(c.env).handleNotification({
		provider,
		body,
		headers: c.req.raw.headers,
		requestUrl: c.req.url,
	});
	log('GatewayController', '出参', requestId, {
		provider:  provider,
		result: result.code,
		orderId: 'orderId' in result ? result.orderId : undefined,
		claimed: 'claimed' in result ? result.claimed : undefined,
	});
	return respond(c, provider, result);
}

function respond(c: GatewayContext, provider: GatewayProvider, result: GatewayResult) {
	// 成功响应
	if (result.code === GATEWAY_RESULT_CODE.ACCEPTED) {
		if (provider === GATEWAY_PROVIDER.XUNHUPAY || provider === GATEWAY_PROVIDER.ALIPAY) {
			return c.text('success');
		}
		if (provider === GATEWAY_PROVIDER.STRIPE) {
			return c.json({ received: true });
		}
		return c.json({ ok: true });
	}

	// 错误响应
	const errorMap: Record<string, { status: number; messages: Record<string, string> }> = {
		[GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED]: {
			status: HTTP_STATUS.SERVICE_UNAVAILABLE,
			messages: {
				[GATEWAY_PROVIDER.XUNHUPAY]: 'fail',
				[GATEWAY_PROVIDER.ALIPAY]: 'fail',
				[GATEWAY_PROVIDER.WXPAY]: 'Wechat Pay is not configured',
				[GATEWAY_PROVIDER.STRIPE]: 'Stripe is not configured',
				default: 'Generic provider is not configured',
			},
		},
		[GATEWAY_RESULT_CODE.ORDER_NOT_FOUND]: {
			status: HTTP_STATUS.NOT_FOUND,
			messages: {
				[GATEWAY_PROVIDER.XUNHUPAY]: 'fail',
				[GATEWAY_PROVIDER.ALIPAY]: 'fail',
				default: 'Order not found',
			},
		},
		[GATEWAY_RESULT_CODE.INVALID_NOTIFICATION]: {
			status: HTTP_STATUS.BAD_REQUEST,
			messages: {
				[GATEWAY_PROVIDER.XUNHUPAY]: 'fail',
				[GATEWAY_PROVIDER.ALIPAY]: 'fail',
				[GATEWAY_PROVIDER.WXPAY]: 'Invalid Wechat Pay notification',
				[GATEWAY_PROVIDER.STRIPE]: 'Invalid Stripe webhook',
				default: 'Invalid notification',
			},
		},
		[GATEWAY_RESULT_CODE.ORDER_MISMATCH]: {
			status: HTTP_STATUS.BAD_REQUEST,
			messages: {
				[GATEWAY_PROVIDER.XUNHUPAY]: 'fail',
				[GATEWAY_PROVIDER.ALIPAY]: 'fail',
				default: 'Notification amount mismatch',
			},
		},
	};

	const errorConfig = errorMap[result.code];
	const message = (errorConfig.messages as any)[provider] || errorConfig.messages.default;

	// 文本协议：支付宝、虎皮椒
	if (provider === GATEWAY_PROVIDER.XUNHUPAY || provider === GATEWAY_PROVIDER.ALIPAY) {
		return c.text(message as string, errorConfig.status as any);
	}

	// JSON 协议：微信、Stripe、通用
	return c.json({ error: message as string }, errorConfig.status as any);
}
