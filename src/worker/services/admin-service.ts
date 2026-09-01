import { createDb } from '../../db/client';
import { OrderRepository } from '../repositories/order';
import { ProviderRepository } from '../repositories/provider';
import { MerchantRepository } from '../repositories/merchant';
import { deliverPaidOrder } from './order-delivery-service';
import { RefundService } from './refund-service';
import type { RefundRequest } from '../dto/refund.dto';

export class AdminService {
	private readonly orders: OrderRepository;
	private readonly providers: ProviderRepository;

	constructor(private readonly env: Env) {
		const db = createDb(env.DB);
		this.orders = new OrderRepository(db);
		this.providers = new ProviderRepository(db);
	}

	async dashboard() {
		const rows = await this.orders.findAll();
		return {
			orders: rows.length,
			pending: rows.filter((row) => row.status === 'PENDING').length,
			paid: rows.filter((row) => ['PAID', 'COMPLETED'].includes(row.status)).length,
			revenue: rows.filter((row) => ['PAID', 'COMPLETED'].includes(row.status)).reduce((sum, row) => sum + Number(row.amount), 0),
		};
	}

	async paymentTestConfig() {
		const providers = await this.providers.findAll();
		const enabledPaymentTypes = Array.from(
			new Set(
				providers
					.flatMap((p) => p.supportedTypes.split(',').map((t) => t.trim()))
					.filter(Boolean)
					.map((value) => (value === 'alipay_direct' ? 'alipay' : value === 'wxpay_direct' ? 'wxpay' : value))
					.filter((value) => ['alipay', 'wxpay', 'stripe'].includes(value)),
			),
		);
		return {
			enabledPaymentTypes,
			paymentProviders: providers.map(({ config: _config, ...provider }) => provider),
			minAmount: 1,
			maxAmount: 1000,
			orderTimeoutMinutes: 5,
			balanceDisabled: false,
		};
	}

	findOrder(id: string) { return this.orders.findById(id); }
	findOrderByExternalNo(externalOrderNo: string) { return this.orders.findByExternalOrderNo(externalOrderNo); }
	cancelOrder(id: string) { return this.orders.cancelPending(id); }
	listOrders(filter: Parameters<OrderRepository['findFiltered']>[0]) { return this.orders.findFiltered(filter); }
	listRefunds(filter: { status?: string; page: number; pageSize: number }) {
		return this.orders.findRefunds(filter);
	}
	listProviders() { return this.providers.findAll(); }
	async getProvider(id: string) {
		const provider = await this.providers.findById(id);
		if (!provider) return null;
		let config: Record<string, unknown> = {};
		try { config = JSON.parse(provider.config || '{}') as Record<string, unknown>; } catch { config = {}; }
		return { provider: { ...provider, config } };
	}
	async createProvider(input: {
		name: string;
		providerKey: string;
		config: string;
		supportedTypes: string;
		enabled: boolean;
		sortOrder: number;
		refundEnabled: boolean;
	}) {
		const now = new Date();
		const provider = {
			id: crypto.randomUUID(), ...input, limits: null, createdAt: now, updatedAt: now,
		};
		await this.providers.insert(provider);
		return provider;
	}
	updateProvider(id: string, patch: Parameters<ProviderRepository['update']>[1]) { return this.providers.update(id, patch); }
	async deleteProvider(id: string) {
		const provider = await this.providers.findById(id);
		if (!provider) return { kind: 'missing' as const };
		if (await this.orders.hasProviderOrders(id)) return { kind: 'has-orders' as const };
		await this.providers.delete(id);
		return { kind: 'deleted' as const };
	}
	refund(input: RefundRequest) {
		return new RefundService(this.env).refund(input);
	}
	async retryNotification(id: string) {
		const order = await this.orders.findById(id);
		if (!order || !['PAID', 'RECHARGING'].includes(order.status)) return null;
		return deliverPaidOrder(this.env, order);
	}
}
