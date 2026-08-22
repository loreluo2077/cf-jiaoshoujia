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

	it('exchanges the navigation token for a clean redirect', async () => {
		const response = await SELF.fetch('https://example.com/auth/callback?token=test-navigation-token', { redirect: 'manual' });

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/');
		expect(response.headers.get('set-cookie')).toContain('jiaoshoujia_session=');
	});
});
