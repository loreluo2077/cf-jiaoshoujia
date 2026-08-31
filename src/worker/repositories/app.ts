import { desc, eq } from 'drizzle-orm';
import { appConfigs, apps } from '../../db/schema';
import type { Database } from './types';

export class AppRepository {
	constructor(private readonly db: Database) {}

	findById(id: string) {
		return this.db
			.select()
			.from(apps)
			.where(eq(apps.id, id))
			.limit(1)
			.then((rows) => rows[0]);
	}

	findByCode(code: string) {
		return this.db
			.select()
			.from(apps)
			.where(eq(apps.code, code))
			.limit(1)
			.then((rows) => rows[0]);
	}

	findAll() {
		return this.db.select().from(apps).orderBy(desc(apps.updatedAt));
	}

	insert(app: typeof apps.$inferInsert) {
		return this.db.insert(apps).values(app);
	}

	update(id: string, patch: Partial<typeof apps.$inferInsert>) {
		return this.db.update(apps).set(patch).where(eq(apps.id, id));
	}

	findConfig(appId: string) {
		return this.db
			.select()
			.from(appConfigs)
			.where(eq(appConfigs.appId, appId))
			.limit(1)
			.then((rows) => rows[0]);
	}

	insertConfig(config: typeof appConfigs.$inferInsert) {
		return this.db.insert(appConfigs).values(config);
	}

	updateConfig(appId: string, patch: Partial<typeof appConfigs.$inferInsert>) {
		return this.db.update(appConfigs).set(patch).where(eq(appConfigs.appId, appId));
	}
}
