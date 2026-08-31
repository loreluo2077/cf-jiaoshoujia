import { createDb } from '../../db/client';
import { OrderRepository } from '../repositories/order';
import { ProviderRepository } from '../repositories/provider';
import { MerchantRepository } from '../repositories/merchant';
import { createPaymentProviders } from '../payment/providers';
import { sign } from '../payment/downstream/easypay';
import { createManagedOrder, ManagedOrderError } from './order-service';

export type BridgeConfig = { id?: string; pid: string; key: string };
export type EasyPayParams = Record<string, string>;

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
		if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(params.money || '') || Number(params.money).toFixed(2) !== order.amount) throw new ManagedOrderError('虎皮椒仅支持整单退款', 422);
		const instance = order.providerInstanceId ? await this.providerRepository.findById(order.providerInstanceId) : undefined;
		if (!instance) throw new ManagedOrderError('支付渠道不存在', 503);
		const provider = createPaymentProviders([instance], this.env.PUBLIC_URL || 'https://example.com').easyPay;
		if (!provider?.refund) throw new ManagedOrderError('该支付渠道不支持易支付退款', 422);
		await provider.refund(order.paymentTradeNo || order.id, order.id, Number(order.amount));
		await this.orderRepository.update(order.id, { status: 'REFUNDED', paymentStatus: 'REFUNDED', refundAmount: order.amount, refundAt: new Date(), updatedAt: new Date() });
		return { kind: 'refunded' as const, order };
	}

	static sign(params: Record<string, string>, key: string) { return sign(params, key); }
}

export function createEasyPayService(env: Env, requestUrl: string) {
	const db = createDb(env.DB);
	return new EasyPayService(env, new OrderRepository(db), new ProviderRepository(db), new MerchantRepository(db));
}
