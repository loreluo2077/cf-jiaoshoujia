import { Hono } from 'hono';
import { hasAuthSecret } from '../auth/constants';
import { hasLocalAuthBypass } from '../auth/local';
import { clearSession, hasValidSession, issueSession } from '../auth/session';
import { isValidTotp } from '../auth/totp';
import { isValidNavigationToken } from '../auth/token';
import { log } from '../utils/controller-logger';
import type { WorkerEnv } from '../types';

export const authRoutes = new Hono<WorkerEnv>();

authRoutes.post('/totp', async (c) => {
	log('AuthController', '入参', c.get('requestId'), { hasCode: true });
	if (!hasAuthSecret(c.env)) {
		log('AuthController', '出参', c.get('requestId'), { error: 'AUTH_NOT_CONFIGURED' });
		return c.json({ error: 'Authentication is not configured' }, 503);
	}
	const body: { code?: unknown } = await c.req.json<{ code?: unknown }>().catch(() => ({}));
	if (typeof body.code !== 'string' || !isValidTotp(body.code, c.env.TOTP_SECRET)) {
		log('AuthController', '出参', c.get('requestId'), { error: 'INVALID_CODE' });
		return c.json({ error: 'Invalid code' }, 401);
	}

	await issueSession(c);
	log('AuthController', '出参', c.get('requestId'), { authenticated: true });
	return c.json({ authenticated: true });
});

authRoutes.get('/session', async (c) => {
	log('AuthController', '入参', c.get('requestId'), { path: '/session' });
	const authenticated = hasLocalAuthBypass(c.req.raw, c.env.LOCAL_AUTH_BYPASS) || (await hasValidSession(c));
	log('AuthController', '出参', c.get('requestId'), { authenticated });
	return c.json({ authenticated });
});

authRoutes.post('/logout', (c) => {
	log('AuthController', '入参', c.get('requestId'), { path: '/logout' });
	clearSession(c);
	const authenticated = hasLocalAuthBypass(c.req.raw, c.env.LOCAL_AUTH_BYPASS);
	log('AuthController', '出参', c.get('requestId'), { authenticated });
	return c.json({ authenticated });
});

export const navigationAuthRoute = new Hono<WorkerEnv>();

navigationAuthRoute.get('/', async (c) => {
	log('NavigationAuthController', '入参', c.get('requestId'), { hasToken: Boolean(c.req.query('token')) });
	if (!hasAuthSecret(c.env) || !isValidNavigationToken(c.req.query('token'), c.env.NAVIGATION_TOKEN)) {
		log('NavigationAuthController', '出参', c.get('requestId'), { error: 'INVALID_TOKEN' });
		return c.json({ error: 'Invalid navigation token' }, 401);
	}

	await issueSession(c);
	log('NavigationAuthController', '出参', c.get('requestId'), { authenticated: true, redirect: '/' });
	return c.redirect('/');
});
