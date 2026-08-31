import { hasLocalAuthBypass } from '../libs/auth/local';
import { isValidApiToken, isValidNavigationToken } from '../libs/auth/token';
import { isValidTotp } from '../libs/auth/totp';

export type AuthConfig = { totpSecret?: string; navigationToken?: string; sessionSecret?: string; apiToken?: string; };

export class AuthService {
	isTotpConfigured(config: AuthConfig): boolean { return typeof config.totpSecret === 'string' && config.totpSecret.length > 0 && typeof config.sessionSecret === 'string' && config.sessionSecret.length > 0; }
	isNavigationConfigured(config: AuthConfig): boolean { return typeof config.navigationToken === 'string' && config.navigationToken.length > 0 && typeof config.sessionSecret === 'string' && config.sessionSecret.length > 0; }
	isApiConfigured(config: AuthConfig): boolean { return typeof config.apiToken === 'string' && config.apiToken.length > 0; }
	validateTotp(code: unknown, secret?: string): boolean { return typeof code === 'string' && typeof secret === 'string' && secret.length > 0 && isValidTotp(code, secret); }
	validateNavigationToken(token: string | undefined, expectedToken?: string): boolean { return typeof expectedToken === 'string' && expectedToken.length > 0 && isValidNavigationToken(token, expectedToken); }
	validateApiRequest(request: Request, expectedToken?: string): boolean { return typeof expectedToken === 'string' && expectedToken.length > 0 && isValidApiToken(request, expectedToken); }
	isLocalBypass(request: Request, bypass?: string): boolean { return hasLocalAuthBypass(request, bypass); }
}
