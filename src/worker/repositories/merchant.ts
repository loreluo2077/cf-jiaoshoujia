import { eq } from 'drizzle-orm';
import { downstreamMerchants } from '../../db/schema';
import type { Database } from './types';

export class MerchantRepository {
	constructor(private readonly db: Database) {}

	findById(id: string) {
		return this.db
			.select()
			.from(downstreamMerchants)
			.where(eq(downstreamMerchants.id, id))
			.limit(1)
			.then((rows) => rows[0]);
	}

	findByCode(code: string) {
		return this.db
			.select()
			.from(downstreamMerchants)
			.where(eq(downstreamMerchants.code, code))
			.limit(1)
			.then((rows) => rows[0]);
	}

	insertIfAbsent(merchant: typeof downstreamMerchants.$inferInsert) {
		return this.db.insert(downstreamMerchants).values(merchant).onConflictDoNothing();
	}
}
