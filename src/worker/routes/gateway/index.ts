import { Hono, type Context } from 'hono';
import { GATEWAY_PROVIDER, GATEWAY_RESULT_CODE } from '../../services/gateway-constants';
import { GatewayService, type GatewayProvider, type GatewayResult } from '../../services/gateway-service';
import { createDb } from '../../../db/client';
import { AuditLogRepository } from '../../repositories/audit-log';
import { OrderRepository } from '../../repositories/order';
import { ProviderRepository } from '../../repositories/provider';
import { MerchantRepository } from '../../repositories/merchant';
import { OrderDeliveryService } from '../../services/order-delivery-service';
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

async function handleCallback(c: GatewayContext, provider: GatewayProvider, providerKey?: string) {
	const body = await c.req.text();
	const requestId = c.get('requestId');
	log('GatewayController', '入参', requestId, {
		provider: providerKey || provider,
		contentTypePresent: Boolean(c.req.header('content-type')),
		contentLength: new TextEncoder().encode(body).byteLength,
	});
	if (!body.trim()) {
		log('GatewayController', '出参', requestId, { result: GATEWAY_RESULT_CODE.INVALID_NOTIFICATION });
		return respond(c, provider, { code: GATEWAY_RESULT_CODE.INVALID_NOTIFICATION });
	}
	const result = await new GatewayService(c.env).handleNotification({
		provider,
		providerKey,
		body,
		headers: c.req.raw.headers,
		requestUrl: c.req.url,
	});
	log('GatewayController', '出参', requestId, {
		provider: providerKey || provider,
		result: result.code,
		orderId: 'orderId' in result ? result.orderId : undefined,
		claimed: 'claimed' in result ? result.claimed : undefined,
	});
	return respond(c, provider, result);
}

function respond(c: GatewayContext, provider: GatewayProvider, result: GatewayResult) {
	if (provider === GATEWAY_PROVIDER.XUNHUPAY || provider === GATEWAY_PROVIDER.ALIPAY) {
		if (result.code === GATEWAY_RESULT_CODE.ACCEPTED) return c.text('success');
		return c.text(
			'fail',
			result.code === GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED
				? HTTP_STATUS.SERVICE_UNAVAILABLE
				: result.code === GATEWAY_RESULT_CODE.ORDER_NOT_FOUND
					? HTTP_STATUS.NOT_FOUND
					: HTTP_STATUS.BAD_REQUEST,
		);
	}
	if (provider === GATEWAY_PROVIDER.WXPAY) {
		if (result.code === GATEWAY_RESULT_CODE.ACCEPTED) return c.json({ ok: true });
		if (result.code === GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED)
			return c.json({ error: 'Wechat Pay is not configured' }, HTTP_STATUS.SERVICE_UNAVAILABLE);
		return c.json(
			{ error: result.code === GATEWAY_RESULT_CODE.INVALID_NOTIFICATION ? 'Invalid Wechat Pay notification' : 'Notification mismatch' },
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	if (provider === GATEWAY_PROVIDER.STRIPE) {
		if (result.code === GATEWAY_RESULT_CODE.ACCEPTED) return c.json({ received: true });
		if (result.code === GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED)
			return c.json({ error: 'Stripe is not configured' }, HTTP_STATUS.SERVICE_UNAVAILABLE);
		return c.json(
			{ error: result.code === GATEWAY_RESULT_CODE.INVALID_NOTIFICATION ? 'Invalid Stripe webhook' : 'Notification mismatch' },
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	if (result.code === GATEWAY_RESULT_CODE.ACCEPTED) return c.json({ ok: true });
	if (result.code === GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED)
		return c.json({ error: 'Generic provider is not configured' }, HTTP_STATUS.SERVICE_UNAVAILABLE);
	if (result.code === GATEWAY_RESULT_CODE.ORDER_NOT_FOUND) return c.json({ error: 'Order not found' }, HTTP_STATUS.NOT_FOUND);
	return c.json(
		{ error: result.code === GATEWAY_RESULT_CODE.ORDER_MISMATCH ? 'Notification amount mismatch' : 'Invalid notification' },
		HTTP_STATUS.BAD_REQUEST,
	);
}
