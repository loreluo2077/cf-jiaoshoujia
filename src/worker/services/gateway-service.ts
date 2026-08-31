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
} from '../payment/core/constants';
import type { PaymentNotification, PaymentProvider } from '../payment/core/types';
import { createPaymentProviders } from '../payment/providers';
import { GenericHttpProvider } from '../payment/upstream/generic';
import {
	GATEWAY_PROVIDER,
	GATEWAY_RESULT_CODE,
	type GatewayProvider,
	type GatewayResult,
	type GatewayNotificationRequest,
} from '../dto/gateway.dto';
import { OrderDeliveryService } from './order-delivery-service';

const LOCAL_GATEWAY_HOSTS = ['localhost', '127.0.0.1'];
const LOCAL_GENERIC_PROVIDER_BASE_URL = 'http://localhost:8787/downstream/test';

export type { GatewayProvider } from '../dto/gateway.dto';

export type VerifiedNotification = {
	notification: PaymentNotification;
	instance?: PaymentProviderInstance;
};

type VerifyResult = VerifiedNotification | GatewayResult;

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
		logBusiness({ message: '支付回调开始', payload: { provider: request.provider } });

		const verified = await this.verifyNotification(request);
		if ('code' in verified) {
			logBusiness({
				message: '支付回调验签失败',
				payload: { provider: request.provider },
				error: `验签失败: ${verified.code}`,
			});
			return verified;
		}

		const { notification, instance } = verified;
		logBusiness({
			message: `支付回调处理中，orderId：${notification.orderId}`,
			payload: { tradeNo: notification.tradeNo, amount: notification.amount, status: notification.status },
		});

		const order = await this.orderDao.findById(notification.orderId);
		if (!order) {
			logBusiness({ message: `支付回调订单不存在，orderId：${notification.orderId}` });
			return { code: GATEWAY_RESULT_CODE.ORDER_NOT_FOUND, orderId: notification.orderId };
		}
		if (
			Math.abs(notification.amount - Number(order.payAmount)) > PAYMENT_AMOUNT_TOLERANCE ||
			(order.providerInstanceId && instance?.id !== order.providerInstanceId)
		) {
			logBusiness({
				message: `支付回调金额或渠道不匹配，orderId：${order.id}`,
				error: '金额或渠道不匹配',
				payload: { notifyAmount: notification.amount, orderAmount: order.payAmount },
			});
			return { code: GATEWAY_RESULT_CODE.ORDER_MISMATCH, orderId: order.id };
		}

		const paymentStatus = notification.status === PAYMENT_NOTIFICATION_STATUS.SUCCESS ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.FAILED;
		if (order.status !== ORDER_STATUS.PENDING || order.paymentStatus !== PAYMENT_STATUS.PENDING) {
			logBusiness({
				message: `支付回调订单已处理（幂等），orderId：${order.id}`,
				payload: { msg: '订单已处理，幂等跳过', orderStatus: order.status },
			});
			return { code: GATEWAY_RESULT_CODE.ACCEPTED, orderId: order.id, claimed: false, paymentStatus };
		}

		const claimed = await this.orderDao.claimPayment(order.id, paymentStatus === PAYMENT_STATUS.PAID, notification.tradeNo);
		if (!claimed) {
			logBusiness({ message: `支付回调竞态失败（幂等），orderId：${order.id}`, payload: { msg: 'claimPayment 竞态失败，幂等跳过' } });
			return { code: GATEWAY_RESULT_CODE.ACCEPTED, orderId: order.id, claimed: false, paymentStatus };
		}

		await this.auditLogDao.insert({
			id: crypto.randomUUID(),
			orderId: order.id,
			action: paymentStatus === PAYMENT_STATUS.PAID ? PAYMENT_AUDIT_ACTION.SUCCEEDED : PAYMENT_AUDIT_ACTION.FAILED,
			operator: `provider:${instance?.providerKey || request.provider}`,
			detail: JSON.stringify({ tradeNo: notification.tradeNo, amount: notification.amount }),
			createdAt: new Date(),
		});

		if (paymentStatus === PAYMENT_STATUS.PAID) {
			logBusiness({
				message: `支付回调成功，orderId：${order.id}`,
				payload: { tradeNo: notification.tradeNo, paymentStatus },
			});
			await this.deliveryService.deliverPaidOrder({ ...order, paymentTradeNo: notification.tradeNo });
		} else {
			logBusiness({ message: `上游支付失败通知，orderId：${order.id}`, error: '上游支付失败通知', payload: { paymentStatus } });
		}
		return { code: GATEWAY_RESULT_CODE.ACCEPTED, orderId: order.id, claimed: true, paymentStatus };
	}

	private async verifyNotification(request: GatewayNotificationRequest): Promise<VerifyResult> {
		switch (request.provider) {
			case GATEWAY_PROVIDER.XUNHUPAY:
				return this.verifyXunhuPay(request);
			case GATEWAY_PROVIDER.ALIPAY:
				return this.verifyAlipay(request);
			case GATEWAY_PROVIDER.WXPAY:
				return this.verifyWxpay(request);
			case GATEWAY_PROVIDER.STRIPE:
				return this.verifyStripe(request);
			default:
				return { code: GATEWAY_RESULT_CODE.INVALID_NOTIFICATION };
		}
	}

	private async verifyXunhuPay(request: GatewayNotificationRequest): Promise<VerifyResult> {
		const params = new URLSearchParams(request.body);
		const orderId = params.get('trade_order_id') || params.get('out_trade_no') || '';
		if (!orderId) return { code: GATEWAY_RESULT_CODE.INVALID_NOTIFICATION };

		const order = await this.orderDao.findById(orderId);
		if (!order) return { code: GATEWAY_RESULT_CODE.ORDER_NOT_FOUND, orderId };
		if (!order.providerInstanceId) return { code: GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED };

		const instance = await this.providerDao.findById(order.providerInstanceId);
		if (!instance) return { code: GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED };

		return this.verifyWithInstance(request, instance);
	}

	private async verifyAlipay(request: GatewayNotificationRequest): Promise<VerifyResult> {
		const params = new URLSearchParams(request.body);
		const orderId = params.get('out_trade_no') || '';
		if (!orderId) return { code: GATEWAY_RESULT_CODE.INVALID_NOTIFICATION };

		const order = await this.orderDao.findById(orderId);
		if (!order) return { code: GATEWAY_RESULT_CODE.ORDER_NOT_FOUND, orderId };
		if (!order.providerInstanceId) return { code: GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED };

		const instance = await this.providerDao.findById(order.providerInstanceId);
		if (!instance) return { code: GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED };

		return this.verifyWithInstance(request, instance);
	}

	private async verifyWxpay(request: GatewayNotificationRequest): Promise<VerifyResult> {
		// 微信支付的回调体是加密的，无法提前解析 orderId
		// 需要先用密钥解密，所以暂时保留遍历逻辑
		// TODO: 如果能从 request 中获取 orderId，可以改为直接查询
		return { code: GATEWAY_RESULT_CODE.INVALID_NOTIFICATION };
	}

	private async verifyStripe(request: GatewayNotificationRequest): Promise<VerifyResult> {
		// Stripe webhook 的 orderId 在 metadata 中
		try {
			const body = JSON.parse(request.body);
			const orderId = body?.data?.object?.metadata?.orderId;
			if (!orderId) return { code: GATEWAY_RESULT_CODE.INVALID_NOTIFICATION };

			const order = await this.orderDao.findById(orderId);
			if (!order) return { code: GATEWAY_RESULT_CODE.ORDER_NOT_FOUND, orderId };
			if (!order.providerInstanceId) return { code: GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED };

			const instance = await this.providerDao.findById(order.providerInstanceId);
			if (!instance) return { code: GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED };

			return this.verifyWithInstance(request, instance);
		} catch {
			return { code: GATEWAY_RESULT_CODE.INVALID_NOTIFICATION };
		}
	}



	private async verifyWithInstance(request: GatewayNotificationRequest, instance: PaymentProviderInstance): Promise<VerifyResult> {
		const provider = this.createProvider(request.provider, instance, request.requestUrl);
		if (!provider) return { code: GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED };
		try {
			const notification = await provider.verifyNotification(request.body, request.headers);
			return { notification, instance };
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
