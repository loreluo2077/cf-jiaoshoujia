import { createDb } from '../../db/client';
import { OrderRepository } from '../repositories/order';
import { ProviderRepository } from '../repositories/provider';
import { MerchantRepository } from '../repositories/merchant';
import { createPaymentProviders } from '../payment/providers';
import { sign } from '../payment/downstream/easypay';
import { createManagedOrder, ManagedOrderError } from './order-service';
import type { BridgeConfig, EasyPayParams } from '../dto/easypay.dto';

export class EasyPayService {
	constructor(
		private readonly env: Env,
		private readonly orderRepository: OrderRepository,
		private readonly providerRepository: ProviderRepository,
		private readonly merchantRepository: MerchantRepository,
	) {}

	async bridgeConfig(): Promise<BridgeConfig | undefined> {
		const stored = await this.merchantRepository.findByCode('default-easypay');
		if (stored?.enabled) return { id: stored.id, pid: stored.pid, key: stored.secret };
		const pid = this.env.EASYPAY_BRIDGE_PID?.trim();
		const key = this.env.EASYPAY_BRIDGE_KEY?.trim();
		if (!pid || !key) return undefined;
		const now = new Date();
		await this.merchantRepository.insertIfAbsent({ id: crypto.randomUUID(), code: 'default-easypay', protocol: 'easypay', pid, secret: key, enabled: true, createdAt: now, updatedAt: now });
		const created = await this.merchantRepository.findByCode('default-easypay');
		return { id: created?.id, pid, key };
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
			externalNotifyUrl: params.notify_url, externalReturnUrl: params.return_url, downstreamMerchantId: config.id,
			clientIp: params.clientip, returnUrlForOrder: (orderId) => new URL(`/api/easypay/return/${orderId}`, requestUrl).toString(),
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
	return new EasyPayService(env, new OrderRepository(db), new ProviderRepository(db), new MerchantRepository(db));
}
