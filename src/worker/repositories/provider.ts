import { and, eq, inArray } from 'drizzle-orm';
import { paymentProviderInstances } from '../../db/schema';
import type { Database } from './types';

export class ProviderRepository {
	constructor(private readonly db: Database) {}

	findById(id: string) {
		return this.db
			.select()
			.from(paymentProviderInstances)
			.where(eq(paymentProviderInstances.id, id))
			.limit(1)
			.then((rows) => rows[0]);
	}

	findAll() {
		return this.db.select().from(paymentProviderInstances).orderBy(paymentProviderInstances.sortOrder);
	}

	findByAppId(appId: string) {
		return this.db.select().from(paymentProviderInstances).where(eq(paymentProviderInstances.appId, appId));
	}

	findEnabledByAppId(appId: string) {
		return this.db
			.select()
			.from(paymentProviderInstances)
			.where(and(eq(paymentProviderInstances.appId, appId), eq(paymentProviderInstances.enabled, true)));
	}

	findForOrder(appId: string, providerInstanceId?: string | null) {
		return this.db
			.select()
			.from(paymentProviderInstances)
			.where(
				providerInstanceId
					? and(eq(paymentProviderInstances.appId, appId), eq(paymentProviderInstances.id, providerInstanceId))
					: eq(paymentProviderInstances.appId, appId),
			);
	}

	findByKey(providerKey: string) {
		return this.db.select().from(paymentProviderInstances).where(eq(paymentProviderInstances.providerKey, providerKey));
	}

	findByKeys(providerKeys: string[]) {
		return this.db.select().from(paymentProviderInstances).where(inArray(paymentProviderInstances.providerKey, providerKeys));
	}

	insert(provider: typeof paymentProviderInstances.$inferInsert) {
		return this.db.insert(paymentProviderInstances).values(provider);
	}

	update(id: string, patch: Partial<typeof paymentProviderInstances.$inferInsert>) {
		return this.db.update(paymentProviderInstances).set(patch).where(eq(paymentProviderInstances.id, id));
	}

	delete(id: string) {
		return this.db.delete(paymentProviderInstances).where(eq(paymentProviderInstances.id, id));
	}
}
