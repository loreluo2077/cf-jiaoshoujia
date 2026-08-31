import { auditLogs } from '../../db/schema';
import type { Database } from './types';

export class AuditLogRepository {
	constructor(private readonly db: Database) {}

	insert(log: typeof auditLogs.$inferInsert) {
		return this.db.insert(auditLogs).values(log);
	}
}
