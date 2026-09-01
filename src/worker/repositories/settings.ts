import { eq } from 'drizzle-orm';
import type { createDb } from '../../db/client';
import { appSettings, type AppSetting } from '../../db/schema';
import { BusinessException } from '../errors/app';

type Database = ReturnType<typeof createDb>;

export interface SettingsRepository {
	list(): Promise<AppSetting[]>;
	findByKey(key: string): Promise<AppSetting | null>;
	upsert(key: string, value: string, updatedAt: Date): Promise<AppSetting>;
	delete(key: string): Promise<void>;
}

export function createSettingsRepository(db: Database): SettingsRepository {
	return {
		async list() {
			return db.select().from(appSettings);
		},
		async findByKey(key) {
			const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
			return setting ?? null;
		},
		async upsert(key, value, updatedAt) {
			await db.insert(appSettings).values({ key, value, updatedAt }).onConflictDoUpdate({
				target: appSettings.key,
				set: { value, updatedAt },
			});
			const setting = await this.findByKey(key);
			if (!setting) throw new BusinessException('SETTING_PERSIST_FAILED', '设置保存失败', 500);
			return setting;
		},
		async delete(key) {
			await db.delete(appSettings).where(eq(appSettings.key, key));
		},
	};
}
