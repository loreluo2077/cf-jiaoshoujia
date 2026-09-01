import { createDb } from '../../db/client';
import { OrderRepository } from '../repositories/order';
import { ProviderRepository } from '../repositories/provider';
import { AppRepository } from '../repositories/app';
import { createPaymentProviders } from '../libs/payment/providers';
import { sign } from '../libs/payment/downstream/easypay';
import { createManagedOrder, ManagedOrderError } from './order-service';
import { logBusiness } from '../utils/business-logger';
import type { BridgeConfig, EasyPayParams } from '../dto/easypay.dto';

export type CreatePaymentResult =
	| { ok: true; order: any; redirect?: string }
	| { ok: false; code: 'NOT_CONFIGURED' | 'VALIDATION_ERROR' | 'ORDER_EXISTS' | 'ORDER_FAILED' | 'ORDER_CREATING' | 'NO_BROWSER_URL' | 'NO_PAYMENT_INFO'; message?: string };

export type QueryOrRefundResult =
	| { ok: true; kind: 'order'; order: any }
	| { ok: true; kind: 'refunded' }
	| { ok: false; code: 'NOT_CONFIGURED' | 'MERCHANT_VERIFY_FAILED'; message: string }
	| { ok: false; code: 'MANAGED_ERROR' | 'OPERATION_FAILED'; message: string; status: number };

export type ReturnResult =
	| { ok: true; redirectUrl: string }
	| { ok: false; code: 'NOT_CONFIGURED' | 'ORDER_NOT_FOUND'; message: string };

export class EasyPayService {
	constructor(
		private readonly env: Env,
		private readonly orderRepository: OrderRepository,
		private readonly providerRepository: ProviderRepository,
		private readonly appRepository: AppRepository,
	) {}

	async bridgeConfig(): Promise<BridgeConfig | undefined> {
		const stored = await this.appRepository.findByCode('default-easypay');
		if (stored?.enabled) return { id: stored.id, pid: stored.pid, key: stored.secret };
		const pid = this.env.EASYPAY_BRIDGE_PID?.trim();
		const key = this.env.EASYPAY_BRIDGE_KEY?.trim();
		if (!pid || !key) return undefined;
		const now = new Date();
		await this.appRepository.insertIfAbsent({ id: crypto.randomUUID(), code: 'default-easypay', name: '默认易支付应用', protocol: 'easypay', pid, secret: key, enabled: true, createdAt: now, updatedAt: now });
		const created = await this.appRepository.findByCode('default-easypay');
		return { id: created?.id, pid, key };
	}

	async handleCreatePayment(requestUrl: string, params: Record<string, string>, redirect: boolean): Promise<CreatePaymentResult> {
		logBusiness({ message: '创建易支付订单开始', payload: { out_trade_no: params.out_trade_no, redirect } });

		const config = await this.bridgeConfig();
		if (!config) return { ok: false, code: 'NOT_CONFIGURED' };

		const validationError = this.validateCreateRequest(params, config);
		if (validationError) return { ok: false, code: 'VALIDATION_ERROR', message: validationError };

		const existing = await this.findExisting(params.out_trade_no);
		if (existing) {
			if (existing.amount !== EasyPayService.normalizeAmount(params.money) || existing.paymentType !== params.type) {
				return { ok: false, code: 'ORDER_EXISTS' };
			}
			if (existing.status === 'FAILED') {
				return { ok: false, code: 'ORDER_FAILED', message: existing.failedReason || '订单创建失败' };
			}
			if (!existing.payUrl && !existing.qrCode) {
				return { ok: false, code: 'ORDER_CREATING' };
			}
			if (redirect && !existing.payUrl) {
				return { ok: false, code: 'NO_BROWSER_URL' };
			}

			logBusiness({ message: `创建易支付订单完成，orderId：${existing.id}`, payload: { fromCache: true } });
			return { ok: true, order: existing, redirect: redirect ? (existing.payUrl || undefined) : undefined };
		}

		try {
			const result = await this.createOrder(requestUrl, params, config);
			if (!result.order.payUrl && !result.order.qrCode) {
				return { ok: false, code: 'NO_PAYMENT_INFO' };
			}
			if (redirect && !result.order.payUrl) {
				return { ok: false, code: 'NO_BROWSER_URL' };
			}

			logBusiness({ message: `创建易支付订单完成，orderId：${result.order.id}` });
			return { ok: true, order: result.order, redirect: redirect ? (result.order.payUrl || undefined) : undefined };
		} catch (error) {
			if (error instanceof ManagedOrderError) {
				logBusiness({ message: '创建易支付订单失败', error: error.message });
				return { ok: false, code: 'VALIDATION_ERROR', message: error.message };
			}
			const msg = error instanceof Error ? error.message : '创建支付订单失败';
			logBusiness({ message: '创建易支付订单失败', error: msg });
			return { ok: false, code: 'VALIDATION_ERROR', message: msg };
		}
	}

	async handleQueryOrRefund(params: Record<string, string>): Promise<QueryOrRefundResult> {
		const config = await this.bridgeConfig();
		if (!config) return { ok: false, code: 'NOT_CONFIGURED', message: '易支付兼容入口未配置' };

		if (!this.verifyMerchant(params.pid, params.key, config)) {
			return { ok: false, code: 'MERCHANT_VERIFY_FAILED', message: '商户验证失败' };
		}

		try {
			const result = await this.queryOrRefund(params, config);
			if (result.kind === 'order') {
				return { ok: true, kind: 'order', order: result.order };
			}
			return { ok: true, kind: 'refunded' };
		} catch (error) {
			if (error instanceof ManagedOrderError) {
				return { ok: false, code: 'MANAGED_ERROR', message: error.message, status: error.status };
			}
			const msg = error instanceof Error ? error.message : '操作失败';
			return { ok: false, code: 'OPERATION_FAILED', message: msg, status: 500 };
		}
	}

	async handleReturn(orderId: string): Promise<ReturnResult> {
		const config = await this.bridgeConfig();
		if (!config) return { ok: false, code: 'NOT_CONFIGURED', message: 'EasyPay bridge is not configured' };

		const order = await this.findOrderById(orderId);
		if (!order || order.orderType !== 'easypay_bridge' || !order.externalOrderNo || !EasyPayService.validHttpUrl(order.externalReturnUrl || '')) {
			return { ok: false, code: 'ORDER_NOT_FOUND', message: 'Order not found' };
		}

		const returnUrl = order.externalReturnUrl || '';
		const params = this.buildReturnParams(order, config);
		const target = new URL(returnUrl);
		for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);

		return { ok: true, redirectUrl: target.toString() };
	}

	async findExisting(externalOrderNo: string) {
		return this.orderRepository.findByExternalOrderNo(externalOrderNo);
	}

	findOrderById(id: string) {
		return this.orderRepository.findById(id);
	}

	async createOrder(requestUrl: string, params: EasyPayParams, config: BridgeConfig) {
		return createManagedOrder(this.env, requestUrl, {
			amount: Number(params.money), paymentType: params.type, userId: `merchant:${params.out_trade_no}`,
			orderType: 'easypay_bridge', subject: params.name, externalOrderNo: params.out_trade_no,
			externalNotifyUrl: params.notify_url, externalReturnUrl: params.return_url, appId: config.id,
			clientIp: params.clientip, returnUrlForOrder: (orderId) => new URL(`/api/easypay/return/${orderId}`, requestUrl).toString(),
			orderNo:params.out_trade_no
		});
	}

	async queryOrRefund(params: EasyPayParams, config: BridgeConfig) {
		const reference = params.out_trade_no || params.trade_no || '';
		const order = await this.orderRepository.findByReference(reference);
		if (!order || order.orderType !== 'easypay_bridge') throw new ManagedOrderError('订单编号不存在', 404, 'ORDER_NOT_FOUND');
		if (params.act === 'order') return { kind: 'order' as const, order };
		if (params.act !== 'refund') throw new ManagedOrderError('不支持的操作', 422);
		if (order.status === 'REFUNDED') return { kind: 'refunded' as const, order };
		if (!['PAID', 'RECHARGING', 'COMPLETED'].includes(order.status)) throw new ManagedOrderError('订单未支付', 409);
		if (!EasyPayService.validAmount(params.money || '') || EasyPayService.normalizeAmount(params.money) !== order.amount) throw new ManagedOrderError('虎皮椒仅支持整单退款', 422);
		const instance = order.providerInstanceId ? await this.providerRepository.findById(order.providerInstanceId) : undefined;
		if (!instance) throw new ManagedOrderError('支付渠道不存在', 503);
		const provider = createPaymentProviders([instance], this.env.PUBLIC_URL || 'https://example.com').easyPay;
		if (!provider?.refund) throw new ManagedOrderError('该支付渠道不支持易支付退款', 422);
		await provider.refund(order.paymentTradeNo || order.id, order.id, Number(order.amount));
		await this.orderRepository.update(order.id, { status: 'REFUNDED', paymentStatus: 'REFUNDED', refundAmount: order.amount, refundAt: new Date(), updatedAt: new Date() });
		return { kind: 'refunded' as const, order };
	}

	verifyMerchant(pid: string, key: string, config: BridgeConfig): boolean {
		return EasyPayService.constantTimeEqual(pid || '', config.pid) && EasyPayService.constantTimeEqual(key || '', config.key);
	}

	validateCreateRequest(params: EasyPayParams, config: BridgeConfig): string | undefined {
		if (!EasyPayService.constantTimeEqual(params.pid || '', config.pid)) return '商户号错误';
		if (!params.sign || !EasyPayService.constantTimeEqual(sign(params, config.key), params.sign.toLowerCase())) return '签名校验失败';
		if ((params.sign_type || 'MD5').toUpperCase() !== 'MD5') return '仅支持 MD5 签名';
		if (!/^[A-Za-z0-9_-]{1,128}$/.test(params.out_trade_no || '')) return '商户订单号格式错误';
		if (!['alipay', 'wxpay'].includes(params.type)) return '不支持的支付方式';
		if (!EasyPayService.validAmount(params.money || '')) return '金额格式错误';
		if (!params.name || params.name.length > 256) return '商品名称格式错误';
		if (!EasyPayService.validHttpUrl(params.notify_url || '') || !EasyPayService.validHttpUrl(params.return_url || '')) return '回调地址格式错误';
		return undefined;
	}

	buildReturnParams(order: { paymentType: string; externalOrderNo: string | null; paymentTradeNo: string | null; id: string; subject: string; amount: string; status: string }, config: BridgeConfig): Record<string, string> {
		const paid = ['PAID', 'RECHARGING', 'COMPLETED', 'REFUNDED'].includes(order.status);
		const params: Record<string, string> = {
			pid: config.pid,
			type: order.paymentType,
			out_trade_no: order.externalOrderNo || '',
			trade_no: order.paymentTradeNo || order.id,
			name: order.subject,
			money: order.amount,
			trade_status: paid ? 'TRADE_SUCCESS' : order.status,
		};
		params.sign = sign(params, config.key);
		params.sign_type = 'MD5';
		return params;
	}

	static sign(params: Record<string, string>, key: string) { return sign(params, key); }

	static constantTimeEqual(left: string, right: string): boolean {
		const size = Math.max(left.length, right.length);
		let different = left.length ^ right.length;
		for (let index = 0; index < size; index += 1) different |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
		return different === 0;
	}

	static validHttpUrl(value: string): boolean {
		try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
	}

	static validAmount(value: string): boolean {
		return /^\d{1,8}(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
	}

	static normalizeAmount(value: string): string {
		return Number(value).toFixed(2);
	}
}

export function createEasyPayService(env: Env) {
	const db = createDb(env.DB);
	return new EasyPayService(env, new OrderRepository(db), new ProviderRepository(db), new AppRepository(db));
}
