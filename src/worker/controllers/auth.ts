import { Hono } from 'hono';
import { hasNavigationConfig, hasTotpConfig } from '../libs/auth/constants';
import { clearSession, hasValidSession, issueSession } from '../libs/auth/session';
import { log } from '../utils/controller-logger';
import { AuthService } from '../services/auth';
import { serviceUnavailable, unauthorized } from '../errors/http';
import type { WorkerEnv } from '../types';

export const authRoutes = new Hono<WorkerEnv>();
const authService = new AuthService();
const config = (env: Env) => ({ totpSecret: env.TOTP_SECRET, navigationToken: env.NAVIGATION_TOKEN, sessionSecret: env.SESSION_SECRET, apiToken: env.API_TOKEN });

authRoutes.post('/totp', async (c) => {
	log('AuthController', '入参', c.get('requestId'), { code: { present: true } });
	if (!authService.isTotpConfigured(config(c.env))) { log('AuthController', '出参', c.get('requestId'), { error: 'AUTH_NOT_CONFIGURED' }); throw serviceUnavailable('Authentication is not configured'); }
	const body: { code?: unknown } = await c.req.json<{ code?: unknown }>().catch(() => ({}));
	if (!authService.validateTotp(body.code, c.env.TOTP_SECRET)) { log('AuthController', '出参', c.get('requestId'), { error: 'INVALID_CODE' }); throw unauthorized('Invalid code'); }
	await issueSession(c);
	log('AuthController', '出参', c.get('requestId'), { authenticated: true });
	return c.json({ authenticated: true });
});

authRoutes.get('/session', async (c) => {
	log('AuthController', '入参', c.get('requestId'), {});
	const authenticated = authService.isLocalBypass(c.req.raw, c.env.LOCAL_AUTH_BYPASS) || await hasValidSession(c);
	log('AuthController', '出参', c.get('requestId'), { authenticated });
	return c.json({ authenticated });
});

authRoutes.post('/logout', (c) => {
	log('AuthController', '入参', c.get('requestId'), {});
	clearSession(c);
	const authenticated = authService.isLocalBypass(c.req.raw, c.env.LOCAL_AUTH_BYPASS);
	log('AuthController', '出参', c.get('requestId'), { authenticated });
	return c.json({ authenticated });
});

export const navigationAuthRoute = new Hono<WorkerEnv>();
navigationAuthRoute.get('/', async (c) => {
	log('AuthController', '入参', c.get('requestId'), { token: { present: Boolean(c.req.query('token')) } });
	if (!authService.isNavigationConfigured(config(c.env)) || !authService.validateNavigationToken(c.req.query('token'), c.env.NAVIGATION_TOKEN)) { log('AuthController', '出参', c.get('requestId'), { error: 'INVALID_NAVIGATION_TOKEN' }); throw unauthorized('Invalid navigation token'); }
	await issueSession(c);
	log('AuthController', '出参', c.get('requestId'), { redirected: true });
	return c.redirect('/');
});
