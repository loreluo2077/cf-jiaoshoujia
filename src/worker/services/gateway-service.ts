import type { PaymentProviderInstance } from '../../db/schema';
import { createDb } from '../../db/client';
import { logBusiness } from '../utils/business-logger';
import { AuditLogRepository } from '../repositories/audit-log';
import { OrderRepository } from '../repositories/order';
import { ProviderRepository } from '../repositories/provider';
import {
	ORDER_STATUS,
	PAYMENT_AMOUNT_TOLERANCE,
	PAYMENT_AUDIT_ACTION,
	PAYMENT_NOTIFICATION_STATUS,
	PAYMENT_STATUS,
	UPSTREAM_PROVIDER_KEY,
} from '../payment/core/constants';
import type { PaymentNotification, PaymentProvider } from '../payment/core/types';
import { createPaymentProviders } from '../payment/providers';
import { GenericHttpProvider } from '../payment/upstream/generic';
import {
	GATEWAY_PROVIDER,
	GATEWAY_PROVIDER_KEYS,
	GATEWAY_RESULT_CODE,
	LOCAL_GATEWAY_HOSTS,
	LOCAL_GENERIC_PROVIDER_BASE_URL,
	type GatewayProvider,
} from './gateway-constants';
import { OrderDeliveryService } from './order-delivery-service';

export type { GatewayProvider } from './gateway-constants';

export type GatewayResult =
	| {
			code: typeof GATEWAY_RESULT_CODE.ACCEPTED;
			orderId: string;
			claimed: boolean;
			paymentStatus: typeof PAYMENT_STATUS.PAID | typeof PAYMENT_STATUS.FAILED;
	  }
	| { code: typeof GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED }
	| { code: typeof GATEWAY_RESULT_CODE.INVALID_NOTIFICATION }
	| { code: typeof GATEWAY_RESULT_CODE.ORDER_NOT_FOUND; orderId: string }
	| { code: typeof GATEWAY_RESULT_CODE.ORDER_MISMATCH; orderId: string };

export interface GatewayNotificationRequest {
	provider: GatewayProvider;
	providerKey?: string;
	body: string;
	headers: Headers;
	requestUrl: string;
}

type VerifiedNotification = {
	notification: PaymentNotification;
	instance?: PaymentProviderInstance;
};

export class GatewayService {
	private readonly orderDao;
	private readonly providerDao;
	private readonly auditLogDao;
	private readonly deliveryService;

	constructor(private readonly env: Env) {
		const db = createDb(env.DB);
		this.orderDao = new OrderRepository(db);
		this.providerDao = new ProviderRepository(db);
		this.auditLogDao = new AuditLogRepository(db);
		this.deliveryService = new OrderDeliveryService(env);
	}

	async handleNotification(request: GatewayNotificationRequest): Promise<GatewayResult> {
		logBusiness({ action: 'PAYMENT_CALLBACK', phase: '入参', payload: { provider: request.provider, providerKey: request.providerKey } });

		const verified =
			request.provider === GATEWAY_PROVIDER.XUNHUPAY
				? await this.verifyXunhuPay(request)
				: await this.verifyAgainstConfiguredProviders(request);
		if ('code' in verified) {
			logBusiness({
				action: 'PAYMENT_CALLBACK',
				phase: '失败',
				payload: { provider: request.provider },
				error: `验签失败: ${verified.code}`,
			});
			return verified;
		}

		const { notification, instance } = verified;
		logBusiness({
			action: 'PAYMENT_CALLBACK',
			orderId: notification.orderId,
			phase: '处理中',
			payload: { tradeNo: notification.tradeNo, amount: notification.amount, status: notification.status },
		});

		const order = await this.orderDao.findById(notification.orderId);
		if (!order) {
			logBusiness({ action: 'PAYMENT_CALLBACK', orderId: notification.orderId, phase: '失败', error: '订单不存在' });
			return { code: GATEWAY_RESULT_CODE.ORDER_NOT_FOUND, orderId: notification.orderId };
		}
		if (
			Math.abs(notification.amount - Number(order.payAmount)) > PAYMENT_AMOUNT_TOLERANCE ||
			(order.providerInstanceId && instance?.id !== order.providerInstanceId)
		) {
			logBusiness({
				action: 'PAYMENT_CALLBACK',
				orderId: order.id,
				phase: '失败',
				error: '金额或渠道不匹配',
				payload: { notifyAmount: notification.amount, orderAmount: order.payAmount },
			});
			return { code: GATEWAY_RESULT_CODE.ORDER_MISMATCH, orderId: order.id };
		}

		const paymentStatus = notification.status === PAYMENT_NOTIFICATION_STATUS.SUCCESS ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.FAILED;
		if (order.status !== ORDER_STATUS.PENDING || order.paymentStatus !== PAYMENT_STATUS.PENDING) {
			logBusiness({
				action: 'PAYMENT_CALLBACK',
				orderId: order.id,
				phase: '处理中',
				payload: { msg: '订单已处理，幂等跳过', orderStatus: order.status },
			});
			return { code: GATEWAY_RESULT_CODE.ACCEPTED, orderId: order.id, claimed: false, paymentStatus };
		}

		const claimed = await this.orderDao.claimPayment(order.id, paymentStatus === PAYMENT_STATUS.PAID, notification.tradeNo);
		if (!claimed) {
			logBusiness({ action: 'PAYMENT_CALLBACK', orderId: order.id, phase: '处理中', payload: { msg: 'claimPayment 竞态失败，幂等跳过' } });
			return { code: GATEWAY_RESULT_CODE.ACCEPTED, orderId: order.id, claimed: false, paymentStatus };
		}

		await this.auditLogDao.insert({
			id: crypto.randomUUID(),
			orderId: order.id,
			action: paymentStatus === PAYMENT_STATUS.PAID ? PAYMENT_AUDIT_ACTION.SUCCEEDED : PAYMENT_AUDIT_ACTION.FAILED,
			operator: `provider:${instance?.providerKey || request.providerKey || request.provider}`,
			detail: JSON.stringify({ tradeNo: notification.tradeNo, amount: notification.amount }),
			createdAt: new Date(),
		});

		if (paymentStatus === PAYMENT_STATUS.PAID) {
			logBusiness({
				action: 'PAYMENT_CALLBACK',
				orderId: order.id,
				phase: '成功',
				payload: { tradeNo: notification.tradeNo, paymentStatus },
			});
			await this.deliveryService.deliverPaidOrder({ ...order, paymentTradeNo: notification.tradeNo });
		} else {
			logBusiness({ action: 'PAYMENT_CALLBACK', orderId: order.id, phase: '失败', error: '上游支付失败通知', payload: { paymentStatus } });
		}
		return { code: GATEWAY_RESULT_CODE.ACCEPTED, orderId: order.id, claimed: true, paymentStatus };
	}

	private async verifyXunhuPay(request: GatewayNotificationRequest): Promise<
		| VerifiedNotification
		| Extract<
				GatewayResult,
				{
					code:
						| typeof GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED
						| typeof GATEWAY_RESULT_CODE.INVALID_NOTIFICATION
						| typeof GATEWAY_RESULT_CODE.ORDER_NOT_FOUND;
				}
		  >
	> {
		const params = new URLSearchParams(request.body);
		const orderId = params.get('trade_order_id') || params.get('out_trade_no') || '';
		if (!orderId) return { code: GATEWAY_RESULT_CODE.INVALID_NOTIFICATION };
		const order = await this.orderDao.findById(orderId);
		if (!order) return { code: GATEWAY_RESULT_CODE.ORDER_NOT_FOUND, orderId };

		const instances = order.providerInstanceId
			? [await this.providerDao.findById(order.providerInstanceId)].filter((row): row is PaymentProviderInstance => Boolean(row))
			: (await this.providerDao.findByKey(UPSTREAM_PROVIDER_KEY.XUNHUPAY)).filter((row) => row.enabled);
		if (!instances.length) return { code: GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED };
		return this.verifyWithInstances(request, instances);
	}

	private async verifyAgainstConfiguredProviders(
		request: GatewayNotificationRequest,
	): Promise<
		| VerifiedNotification
		| Extract<GatewayResult, { code: typeof GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED | typeof GATEWAY_RESULT_CODE.INVALID_NOTIFICATION }>
	> {
		if (request.provider === GATEWAY_PROVIDER.GENERIC) {
			const key = request.providerKey || UPSTREAM_PROVIDER_KEY.GENERIC;
			const instances = (await this.providerDao.findByKey(key)).filter((row) => row.enabled);
			if (instances.length) return this.verifyWithInstances(request, instances);
			const hostname = new URL(request.requestUrl).hostname;
			if (LOCAL_GATEWAY_HOSTS.has(hostname)) {
				return this.verifyWithProvider(request, new GenericHttpProvider(LOCAL_GENERIC_PROVIDER_BASE_URL));
			}
			return { code: GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED };
		}
		if (request.provider === GATEWAY_PROVIDER.XUNHUPAY) return { code: GATEWAY_RESULT_CODE.INVALID_NOTIFICATION };

		const instances = (await this.providerDao.findByKeys(GATEWAY_PROVIDER_KEYS[request.provider])).filter((row) => row.enabled);
		if (!instances.length) return { code: GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED };
		return this.verifyWithInstances(request, instances);
	}

	private async verifyWithInstances(
		request: GatewayNotificationRequest,
		instances: PaymentProviderInstance[],
	): Promise<
		| VerifiedNotification
		| Extract<GatewayResult, { code: typeof GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED | typeof GATEWAY_RESULT_CODE.INVALID_NOTIFICATION }>
	> {
		let hasUsableProvider = false;
		for (const instance of instances) {
			const provider = this.createProvider(request.provider, instance, request.requestUrl);
			if (!provider) continue;
			hasUsableProvider = true;
			const verified = await this.verifyWithProvider(request, provider, instance);
			if (!('code' in verified)) return verified;
		}
		return {
			code: hasUsableProvider ? GATEWAY_RESULT_CODE.INVALID_NOTIFICATION : GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED,
		};
	}

	private async verifyWithProvider(
		request: GatewayNotificationRequest,
		provider: PaymentProvider,
		instance?: PaymentProviderInstance,
	): Promise<VerifiedNotification | Extract<GatewayResult, { code: typeof GATEWAY_RESULT_CODE.INVALID_NOTIFICATION }>> {
		try {
			return { notification: await provider.verifyNotification(request.body, request.headers), instance };
		} catch {
			return { code: GATEWAY_RESULT_CODE.INVALID_NOTIFICATION };
		}
	}

	private createProvider(provider: GatewayProvider, instance: PaymentProviderInstance, requestUrl: string): PaymentProvider | undefined {
		const providers = createPaymentProviders([instance], requestUrl);
		if (provider === GATEWAY_PROVIDER.XUNHUPAY) return providers.easyPay;
		if (provider === GATEWAY_PROVIDER.ALIPAY) return providers.alipay;
		if (provider === GATEWAY_PROVIDER.WXPAY) return providers.wxpay;
		if (provider === GATEWAY_PROVIDER.STRIPE) return providers.stripe;
		return providers.generic;
	}
}
