import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		cloudflareTest(async () => ({
			wrangler: { configPath: './wrangler.jsonc' },
			miniflare: {
				bindings: {
					TEST_MIGRATIONS: await readD1Migrations(path.join(projectRoot, 'migrations')),
					TOTP_SECRET: 'JBSWY3DPEHPK3PXP',
					SESSION_SECRET: 'test-session-secret',
					NAVIGATION_TOKEN: 'test-navigation-token',
					API_TOKEN: 'test-api-token',
				},
			},
		})),
	],
});
