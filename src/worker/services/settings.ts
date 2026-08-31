import type { AppSetting } from '../../db/schema';
import type { SettingsRepository } from '../repositories/settings';
import type { ValidatedSettingInput } from '../dto/settings.dto';

export class SettingsService {
	constructor(private readonly repository: SettingsRepository) {}

	list(key?: string): Promise<AppSetting[]> {
		return key ? this.repository.findByKey(key).then((setting) => (setting ? [setting] : [])) : this.repository.list();
	}

	upsert(input: ValidatedSettingInput): Promise<AppSetting> {
		return this.repository.upsert(input.key, input.value, new Date());
	}
}
