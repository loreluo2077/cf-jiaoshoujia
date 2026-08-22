import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import * as OTPAuth from 'otpauth';

const require = createRequire(import.meta.url);
const qrcode = require('qrcode-terminal');
const shouldWriteDevVars = process.argv.includes('--write-dev-vars');
const shouldForce = process.argv.includes('--force');

const totpSecret = new OTPAuth.Secret({ size: 20 }).base32;
const totp = new OTPAuth.TOTP({
	issuer: 'Jiaoshoujia',
	label: 'owner',
	algorithm: 'SHA1',
	digits: 6,
	period: 30,
	secret: totpSecret,
});

const secrets = {
	TOTP_SECRET: totpSecret,
	SESSION_SECRET: randomBytes(32).toString('base64url'),
	NAVIGATION_TOKEN: randomBytes(32).toString('base64url'),
	API_TOKEN: randomBytes(32).toString('base64url'),
};

const devVars = Object.entries(secrets)
	.map(([name, value]) => `${name}=${value}`)
	.join('\n') + '\n';

console.log('\nJiaoshoujia authentication setup\n');
console.log('Scan this QR code with your authenticator app:\n');
qrcode.generate(totp.toString(), { small: true });
console.log(`\notpauth URI:\n${totp.toString()}\n`);
console.log('Generated secrets:\n');
for (const [name, value] of Object.entries(secrets)) console.log(`${name}=${value}`);

if (shouldWriteDevVars) {
	if (existsSync('.dev.vars') && !shouldForce) {
		console.error('\n.dev.vars already exists. Nothing was overwritten. Use --force only if you intend to replace it.');
		process.exitCode = 1;
	} else {
		writeFileSync('.dev.vars', devVars, { mode: 0o600 });
		console.log('\nWrote local secrets to .dev.vars');
	}
}

console.log('\nFor Cloudflare production, set each value with:\n');
for (const name of Object.keys(secrets)) console.log(`npx wrangler secret put ${name}`);
console.log('\nKeep these values out of Git, chat logs, screenshots, and client-side code.\n');
