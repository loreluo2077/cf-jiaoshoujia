import type { SettingsRepository } from '../repositories/settings';
import type { ValidatedSettingInput } from '../dto/settings.dto';

export class SettingsService {
	constructor(private readonly settingsRepository: SettingsRepository) {}

	async list(key?: string) {
		if (key) {
			const setting = await this.settingsRepository.findByKey(key);
			return setting ? [setting] : [];
		}
		return this.settingsRepository.list();
	}

	async get(key: string) {
		return this.settingsRepository.findByKey(key);
	}

	async upsert(input: ValidatedSettingInput) {
		return this.settingsRepository.upsert(input.key, input.value, new Date());
	}

	async delete(key: string) {
		const existing = await this.settingsRepository.findByKey(key);
		return existing !== null;
	}
}
