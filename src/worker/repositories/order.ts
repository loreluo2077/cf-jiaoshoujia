import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { orders } from '../../db/schema';
import { ORDER_STATUS, PAYMENT_STATUS } from '../libs/payment/core/constants';
import type { Database } from './types';

export class OrderRepository {
	constructor(private readonly db: Database) {}

	findById(id: string) {
		return this.db
			.select()
			.from(orders)
			.where(eq(orders.id, id))
			.limit(1)
			.then((rows) => rows[0]);
	}

	findByExternalOrderNo(externalOrderNo: string) {
		return this.db
			.select()
			.from(orders)
			.where(eq(orders.externalOrderNo, externalOrderNo))
			.limit(1)
			.then((rows) => rows[0]);
	}

	findByReference(reference: string) {
		return this.db
			.select()
			.from(orders)
			.where(or(eq(orders.externalOrderNo, reference), eq(orders.paymentTradeNo, reference), eq(orders.id, reference)))
			.limit(1)
			.then((rows) => rows[0]);
	}

	findByAppId(appId: string) {
		return this.db.select().from(orders).where(eq(orders.appId, appId));
	}

	findAll() {
		return this.db.select().from(orders).orderBy(desc(orders.createdAt));
	}

	/**
	 * 分页查询订单，支持按状态、支付类型、用户 ID 过滤。
	 * 采用内存过滤保持与现有行为一致（数据量小的场景）。
	 * 
	 */
	async findFiltered(filter: { status?: string; paymentType?: string; userId?: string; page: number; pageSize: number }) {
		const all = await this.db.select().from(orders).orderBy(desc(orders.createdAt));
		const filtered = all.filter(
			(row) =>
				(!filter.status || row.status === filter.status) &&
				(!filter.paymentType || row.paymentType === filter.paymentType) &&
				(!filter.userId || row.userId === filter.userId),
		);
		const rows = filtered.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize);
		return { rows, total: filtered.length };
	}

	findRetryable(limit = 20) {
		return this.db
			.select()
			.from(orders)
			.where(inArray(orders.status, [ORDER_STATUS.PAID, ORDER_STATUS.RECHARGING]))
			.limit(limit);
	}

	hasProviderOrders(providerInstanceId: string) {
		return this.db
			.select({ id: orders.id })
			.from(orders)
			.where(eq(orders.providerInstanceId, providerInstanceId))
			.limit(1)
			.then((rows) => rows.length > 0);
	}

	insert(order: typeof orders.$inferInsert) {
		return this.db.insert(orders).values(order);
	}

	update(id: string, patch: Partial<typeof orders.$inferInsert>) {
		return this.db.update(orders).set(patch).where(eq(orders.id, id));
	}

	async cancelPending(id: string) {
		const result = await this.db
			.update(orders)
			.set({ status: ORDER_STATUS.CANCELLED, paymentStatus: PAYMENT_STATUS.CANCELLED, updatedAt: new Date() })
			.where(and(eq(orders.id, id), eq(orders.status, ORDER_STATUS.PENDING)))
			.run();
		return Boolean(result.meta?.changes);
	}

	async claimPayment(id: string, success: boolean, tradeNo: string) {
		const now = new Date();
		const result = await this.db
			.update(orders)
			.set({
				status: success ? ORDER_STATUS.PAID : ORDER_STATUS.FAILED,
				paymentStatus: success ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.FAILED,
				paymentTradeNo: tradeNo,
				paidAt: success ? now : null,
				updatedAt: now,
			})
			.where(and(eq(orders.id, id), eq(orders.status, ORDER_STATUS.PENDING), eq(orders.paymentStatus, PAYMENT_STATUS.PENDING)))
			.run();
		return Boolean(result.meta?.changes);
	}

	expirePending(now: Date) {
		return this.db
			.update(orders)
			.set({ status: ORDER_STATUS.EXPIRED, paymentStatus: PAYMENT_STATUS.EXPIRED, updatedAt: now })
			.where(and(eq(orders.status, ORDER_STATUS.PENDING), lt(orders.expiresAt, now)));
	}
}
