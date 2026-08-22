import * as OTPAuth from 'otpauth';

export function isValidTotp(code: string, secret: string): boolean {
	if (!/^\d{6}$/.test(code)) return false;

	try {
		const totp = new OTPAuth.TOTP({
			algorithm: 'SHA1',
			digits: 6,
			period: 30,
			secret: OTPAuth.Secret.fromBase32(secret),
		});

		return totp.validate({ token: code, window: 1 }) !== null;
	} catch {
		return false;
	}
}
