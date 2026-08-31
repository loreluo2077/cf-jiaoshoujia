import { createDb } from '../../db/client';
import { logBusiness } from '../utils/business-logger';
import { AppRepository } from '../repositories/app';
import { AuditLogRepository } from '../repositories/audit-log';
import { OrderRepository } from '../repositories/order';
import { ProviderRepository } from '../repositories/provider';
import { selectPaymentProvider } from '../libs/payment/providers';
import { ServiceError } from '../errors/service-error';
import type { ManagedOrderRequest } from '../dto/order.dto';

export class ManagedOrderError extends ServiceError {}

export class OrderService {
	private readonly appDao;
	private readonly orderDao;
	private readonly providerDao;
	private readonly auditLogDao;

	constructor(private readonly env: Env) {
		const db = createDb(env.DB);
		this.appDao = new AppRepository(db);
		this.orderDao = new OrderRepository(db);
		this.providerDao = new ProviderRepository(db);
		this.auditLogDao = new AuditLogRepository(db);
	}

	private async getOrCreateApp(code?: string, appId?: string) {
		if (appId) return this.appDao.findById(appId);
		const appCode = code || 'default';
		const existing = await this.appDao.findByCode(appCode);
		if (existing) return existing;
		const now = new Date();
		const created = { id: crypto.randomUUID(), code: appCode, name: '个人支付网关', status: 'active', createdAt: now, updatedAt: now };
		await this.appDao.insert(created);
		await this.appDao.insertConfig({ appId: created.id, updatedAt: now });
		return created;
	}

	async createManagedOrder(requestUrl: string, input: ManagedOrderRequest) {
		logBusiness({
			message: '创建订单开始',
			payload: { paymentType: input.paymentType, amount: input.amount, orderType: input.orderType, externalOrderNo: input.externalOrderNo },
		});
		const app = await this.getOrCreateApp(input.appCode, input.appId);
		if (!app) throw new ManagedOrderError('App not found', 404);
		const config = await this.appDao.findConfig(app.id);
		const enabledTypes = (config?.enabledPaymentTypes || '')
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		if (enabledTypes.length && !enabledTypes.includes(input.paymentType)) throw new ManagedOrderError('Payment type is disabled', 422);
		if (config && (input.amount < Number(config.minAmount) || input.amount > Number(config.maxAmount))) {
			throw new ManagedOrderError(`amount must be between ${config.minAmount} and ${config.maxAmount}`, 422);
		}

		const orderId = input.orderNo ?? crypto.randomUUID();
		const createdAt = new Date();
		const expiresAt = new Date(createdAt.getTime() + (config?.orderTimeoutMinutes || 5) * 60_000);
		const rechargeCode = `RP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
		const row = {
			id: orderId,
			appId: app.id,
			userId: input.userId,
			userEmail: input.userEmail || null,
			amount: input.amount.toFixed(2),
			payAmount: input.amount.toFixed(2),
			feeRate: 0,
			rechargeCode,
			status: 'PENDING',
			paymentStatus: 'PENDING',
			deliveryStatus: input.orderType === 'easypay_bridge' ? 'PENDING' : 'NOT_REQUIRED',
			paymentType: input.paymentType,
			providerInstanceId: null as string | null,
			paymentTradeNo: null as string | null,
			payUrl: null as string | null,
			qrCode: null as string | null,
			externalOrderNo: input.externalOrderNo || null,
			externalNotifyUrl: input.externalNotifyUrl || null,
			externalReturnUrl: input.externalReturnUrl || null,
			subject: input.subject || '个人支付网关充值',
			orderType: input.orderType || 'balance',
			downstreamMerchantId: input.downstreamMerchantId || null,
			planId: null,
			expiresAt,
			paidAt: null,
			completedAt: null,
			failedReason: null,
			refundAmount: null,
			refundReason: null,
			refundAt: null,
			clientIp: input.clientIp || null,
			srcHost: input.srcHost || null,
			srcUrl: input.srcUrl || null,
			createdAt,
			updatedAt: createdAt,
		};
		await this.orderDao.insert(row);
		await this.auditLogDao.insert({
			id: crypto.randomUUID(),
			orderId,
			action: 'ORDER_CREATED',
			detail: JSON.stringify({
				paymentType: input.paymentType,
				amount: input.amount,
				orderType: row.orderType,
				externalOrderNo: row.externalOrderNo,
			}),
			operator: input.orderType === 'easypay_bridge' ? 'integration:easypay' : `user:${input.userId}`,
			createdAt,
		});

		const selected = selectPaymentProvider(await this.providerDao.findEnabledByAppId(app.id), input.paymentType, input.amount, requestUrl);
		if (selected) {
			try {
				const payment = await selected.provider.createPayment({
					orderId,
					amount: input.amount,
					subject: row.subject,
					paymentType: input.paymentType,
					notifyUrl: new URL(`/api/gateway/notify/${selected.provider.key}`, requestUrl).toString(),
					returnUrl: input.returnUrlForOrder?.(orderId) || '',
				});
				await this.orderDao.update(orderId, {
					providerInstanceId: selected.instance.id,
					paymentTradeNo: payment.tradeNo,
					payUrl: payment.payUrl || null,
					qrCode: payment.qrCode || null,
					updatedAt: new Date(),
				});
				row.providerInstanceId = selected.instance.id;
				row.paymentTradeNo = payment.tradeNo;
				row.payUrl = payment.payUrl || null;
				row.qrCode = payment.qrCode || null;
			} catch (error) {
				const reason = error instanceof Error ? error.message : 'payment provider error';
				await this.orderDao.update(orderId, { status: 'FAILED', paymentStatus: 'FAILED', failedReason: reason, updatedAt: new Date() });
				logBusiness({ message: `创建订单失败，orderId：${orderId}`, error: reason });
				throw new ManagedOrderError(reason, 502);
			}
		}

		const host = new URL(requestUrl).hostname;
		const localHost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
		if (!selected && !localHost) {
			await this.orderDao.update(orderId, {
				status: 'FAILED',
				paymentStatus: 'FAILED',
				failedReason: 'payment provider is not configured',
				updatedAt: new Date(),
			});
			logBusiness({ message: `创建订单失败，orderId：${orderId}`, error: 'payment provider is not configured' });
			throw new ManagedOrderError('payment provider is not configured', 503);
		}
		logBusiness({
			message: `创建订单成功，orderId：${orderId}`,
			payload: { paymentType: input.paymentType, amount: input.amount, provider: row.providerInstanceId },
		});
		return { order: row, statusAccessToken: rechargeCode };
	}
}

export function createManagedOrder(env: Env, requestUrl: string, input: ManagedOrderRequest) {
	return new OrderService(env).createManagedOrder(requestUrl, input);
}
