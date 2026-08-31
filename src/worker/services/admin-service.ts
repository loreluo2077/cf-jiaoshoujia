import { createDb } from '../../db/client';
import { AppRepository } from '../repositories/app';
import { OrderRepository } from '../repositories/order';
import { ProviderRepository } from '../repositories/provider';
import { MerchantRepository } from '../repositories/merchant';
import { deliverPaidOrder } from './order-delivery-service';
import { RefundService, type RefundRequest } from './refund-service';

export class AdminService {
	private readonly apps: AppRepository;
	private readonly orders: OrderRepository;
	private readonly providers: ProviderRepository;

	constructor(private readonly env: Env) {
		const db = createDb(env.DB);
		this.apps = new AppRepository(db);
		this.orders = new OrderRepository(db);
		this.providers = new ProviderRepository(db);
	}

	async dashboard() {
		const app = await this.apps.findByCode('default');
		if (!app) return { orders: 0, pending: 0, paid: 0, revenue: 0 };
		const rows = await this.orders.findByAppId(app.id);
		return {
			orders: rows.length,
			pending: rows.filter((row) => row.status === 'PENDING').length,
			paid: rows.filter((row) => ['PAID', 'COMPLETED'].includes(row.status)).length,
			revenue: rows.filter((row) => ['PAID', 'COMPLETED'].includes(row.status)).reduce((sum, row) => sum + Number(row.amount), 0),
		};
	}

	async paymentTestConfig() {
		const app = await this.apps.findByCode('default');
		if (!app) return null;
		const [config, providers] = await Promise.all([this.apps.findConfig(app.id), this.providers.findByAppId(app.id)]);
		const enabledPaymentTypes = Array.from(
			new Set(
				(config?.enabledPaymentTypes || '')
					.split(',')
					.map((value) => value.trim())
					.filter(Boolean)
					.map((value) => (value === 'alipay_direct' ? 'alipay' : value === 'wxpay_direct' ? 'wxpay' : value))
					.filter((value) => ['alipay', 'wxpay', 'stripe'].includes(value)),
			),
		);
		return {
			app: { name: app.name }, apps: [app], enabledPaymentTypes,
			paymentProviders: providers.map(({ config: _config, ...provider }) => provider),
			minAmount: Number(config?.minAmount || 1), maxAmount: Number(config?.maxAmount || 1000),
			orderTimeoutMinutes: config?.orderTimeoutMinutes || 5, balanceDisabled: Boolean(config?.balanceDisabled),
		};
	}

	findOrder(id: string) { return this.orders.findById(id); }
	cancelOrder(id: string) { return this.orders.cancelPending(id); }
	listApps() { return this.apps.findAll(); }
	async getApp(id: string) {
		const app = await this.apps.findById(id);
		return app ? { app, config: await this.apps.findConfig(app.id) } : null;
	}
	async updateApp(id: string, patch: Parameters<AppRepository['update']>[1]) { return this.apps.update(id, patch); }
	async updateAppConfig(id: string, patch: Parameters<AppRepository['updateConfig']>[1]) { return this.apps.updateConfig(id, patch); }
	async updateDefaultConfig(patch: Parameters<AppRepository['updateConfig']>[1]) {
		const app = await this.apps.findByCode('default');
		if (!app) return false;
		await this.apps.updateConfig(app.id, patch);
		return true;
	}
	listOrders(filter: Parameters<OrderRepository['findFiltered']>[0]) { return this.orders.findFiltered(filter); }
	listProviders() { return this.providers.findAll(); }
	async getProvider(id: string) {
		const provider = await this.providers.findById(id);
		if (!provider) return null;
		const app = await this.apps.findById(provider.appId);
		let config: Record<string, unknown> = {};
		try { config = JSON.parse(provider.config || '{}') as Record<string, unknown>; } catch { config = {}; }
		return { provider: { ...provider, config }, app };
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
		const app = await this.apps.findByCode('default');
		if (!app) return null;
		const now = new Date();
		const provider = {
			id: crypto.randomUUID(), appId: app.id, ...input, limits: null, createdAt: now, updatedAt: now,
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
