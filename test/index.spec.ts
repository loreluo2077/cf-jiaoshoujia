import { applyD1Migrations, env, SELF, type D1Migration } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import * as OTPAuth from 'otpauth';

beforeAll(async () => {
	const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };
	await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

describe('application API', () => {
	const apiHeaders = { authorization: 'Bearer test-api-token' };

	it('reports worker health', async () => {
		const response = await SELF.fetch('https://example.com/api/health');

		expect(response.status).toBe(200);
		expect(response.headers.get('x-request-id')).toBeTruthy();
		expect(await response.json()).toMatchObject({ status: 'ok', service: 'jiaoshoujia' });
	});

	it('exposes the service migration list', async () => {
		const response = await SELF.fetch('https://example.com/api/services', { headers: apiHeaders });
		const body = (await response.json()) as { services: Array<{ id: string }> };

		expect(response.status).toBe(200);
		expect(body.services.map((service) => service.id)).toEqual(['image-bed', 'card-life', 'llm-proxy']);
	});

	it('writes, updates, and reads a D1 setting through Drizzle', async () => {
		const firstWrite = await SELF.fetch('https://example.com/api/settings/database-test', {
			method: 'PUT',
			headers: { ...apiHeaders, 'content-type': 'application/json' },
			body: JSON.stringify({ value: 'first value' }),
		});
		const secondWrite = await SELF.fetch('https://example.com/api/settings/database-test', {
			method: 'PUT',
			headers: { ...apiHeaders, 'content-type': 'application/json' },
			body: JSON.stringify({ value: 'updated value' }),
		});
		const read = await SELF.fetch('https://example.com/api/settings?key=database-test', { headers: apiHeaders });
		const body = (await read.json()) as { settings: Array<{ key: string; value: string }> };

		expect(firstWrite.status).toBe(200);
		expect(secondWrite.status).toBe(200);
		expect(read.status).toBe(200);
		expect(body.settings).toEqual([{ key: 'database-test', value: 'updated value', updatedAt: expect.any(String) }]);
	});

	it('rejects unauthenticated settings access', async () => {
		const response = await SELF.fetch('https://example.com/api/settings');
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized', message: 'Unauthorized' });
	});

	it('rejects invalid settings input at the API boundary', async () => {
		const invalidJson = await SELF.fetch('https://example.com/api/settings/invalid key', {
			method: 'PUT',
			headers: { ...apiHeaders, 'content-type': 'application/json' },
			body: '{',
		});
		const invalidValue = await SELF.fetch('https://example.com/api/settings/invalid-key', {
			method: 'PUT',
			headers: { ...apiHeaders, 'content-type': 'application/json' },
			body: JSON.stringify({ value: '   ' }),
		});
		const invalidKey = await SELF.fetch('https://example.com/api/settings/invalid%20key', {
			method: 'PUT',
			headers: { ...apiHeaders, 'content-type': 'application/json' },
			body: JSON.stringify({ value: 'ok' }),
		});

		expect(invalidJson.status).toBe(400);
		expect(invalidValue.status).toBe(400);
		expect(invalidKey.status).toBe(400);
		expect(await invalidJson.json()).toMatchObject({ error: 'BAD_REQUEST' });
		expect(await invalidValue.json()).toMatchObject({ error: 'BAD_REQUEST' });
		expect(await invalidKey.json()).toMatchObject({ error: 'BAD_REQUEST' });
	});

	it('returns an empty collection for an unknown setting key', async () => {
		const response = await SELF.fetch('https://example.com/api/settings?key=missing-setting', { headers: apiHeaders });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ settings: [] });
	});

	it('rejects an invalid TOTP code', async () => {
		const response = await SELF.fetch('https://example.com/api/auth/totp', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ code: '000000' }),
		});

		expect(response.status).toBe(401);
	});

	it('logs in with TOTP and issues a session cookie', async () => {
		const totp = new OTPAuth.TOTP({
			algorithm: 'SHA1',
			digits: 6,
			period: 30,
			secret: OTPAuth.Secret.fromBase32('JBSWY3DPEHPK3PXP'),
		});
		const response = await SELF.fetch('https://example.com/api/auth/totp', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ code: totp.generate() }),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('set-cookie')).toContain('jiaoshoujia_session=');
	});

	it('allows API access with the bearer API token', async () => {
		const response = await SELF.fetch('https://example.com/api/services', {
			headers: { authorization: 'Bearer test-api-token' },
		});

		expect(response.status).toBe(200);
	});

	it('bypasses authentication only for local development hosts', async () => {
		const localSession = await SELF.fetch('http://localhost/api/auth/session');
		const localApi = await SELF.fetch('http://127.0.0.1/api/services');
		const productionApi = await SELF.fetch('https://example.com/api/services');

		expect(await localSession.json()).toEqual({ authenticated: true });
		expect(localApi.status).toBe(200);
		expect(productionApi.status).toBe(401);
	});

	it('exchanges the navigation token for a clean redirect', async () => {
		const response = await SELF.fetch('https://example.com/auth/callback?token=test-navigation-token', { redirect: 'manual' });

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/');
		expect(response.headers.get('set-cookie')).toContain('jiaoshoujia_session=');
	});
});
