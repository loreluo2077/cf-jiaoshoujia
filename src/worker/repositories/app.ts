import { eq } from 'drizzle-orm';
import { apps } from '../../db/schema';
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
		return this.db.select().from(apps);
	}

	insert(app: typeof apps.$inferInsert) {
		return this.db.insert(apps).values(app);
	}

	insertIfAbsent(app: typeof apps.$inferInsert) {
		return this.db.insert(apps).values(app).onConflictDoNothing();
	}

	update(id: string, patch: Partial<typeof apps.$inferInsert>) {
		return this.db.update(apps).set(patch).where(eq(apps.id, id));
	}

	delete(id: string) {
		return this.db.delete(apps).where(eq(apps.id, id));
	}
}
