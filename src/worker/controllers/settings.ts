import { Hono } from 'hono';
import { createDb } from '../../db/client';
import { createSettingsRepository } from '../repositories/settings';
import { log } from '../utils/controller-logger';
import { SettingsService, type ValidatedSettingInput } from '../services/settings';
import type { WorkerEnv } from '../types';
import { badRequest } from '../errors/http';

export const settingsRoutes = new Hono<WorkerEnv>();

const getService = (env: Env) => new SettingsService(createSettingsRepository(createDb(env.DB)));

settingsRoutes.get('/', async (c) => {
	log('SettingsController', '入参', c.get('requestId'), { query: c.req.query('key') ? { keyPresent: true } : {} });
	const settings = await getService(c.env).list(c.req.query('key'));
	log('SettingsController', '出参', c.get('requestId'), { count: settings.length });
	return c.json({ settings });
});

settingsRoutes.put('/:key', async (c) => {
	const key = c.req.param('key');
	log('SettingsController', '入参', c.get('requestId'), { key: { present: key.length > 0, length: key.length } });
	let body: { value?: unknown };
	try { body = await c.req.json<{ value?: unknown }>(); } catch {
		log('SettingsController', '出参', c.get('requestId'), { error: 'INVALID_JSON' });
		throw badRequest('Invalid JSON body');
	}
	if (!/^[A-Za-z0-9._-]{1,100}$/.test(key) || typeof body.value !== 'string' || body.value.trim() === '') {
		log('SettingsController', '出参', c.get('requestId'), { error: 'VALIDATION_ERROR' });
		throw badRequest(typeof body.value !== 'string' || body.value.trim() === '' ? 'value must be a non-empty string' : 'invalid key');
	}
	const input: ValidatedSettingInput = { key, value: body.value };
	const setting = await getService(c.env).upsert(input);
	log('SettingsController', '出参', c.get('requestId'), { saved: true });
	return c.json({ setting });
});
