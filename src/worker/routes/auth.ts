import { Hono } from 'hono';
import { hasAuthSecret } from '../auth/constants';
import { hasLocalAuthBypass } from '../auth/local';
import { clearSession, hasValidSession, issueSession } from '../auth/session';
import { isValidTotp } from '../auth/totp';
import { isValidNavigationToken } from '../auth/token';

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post('/totp', async (c) => {
	if (!hasAuthSecret(c.env)) return c.json({ error: 'Authentication is not configured' }, 503);
	const body: { code?: unknown } = await c.req.json<{ code?: unknown }>().catch(() => ({}));
	if (typeof body.code !== 'string' || !isValidTotp(body.code, c.env.TOTP_SECRET)) return c.json({ error: 'Invalid code' }, 401);

	await issueSession(c);
	return c.json({ authenticated: true });
});

authRoutes.get('/session', async (c) => c.json({
	authenticated: hasLocalAuthBypass(c.req.raw, c.env.LOCAL_AUTH_BYPASS) || await hasValidSession(c),
}));

authRoutes.post('/logout', (c) => {
	clearSession(c);
	return c.json({ authenticated: hasLocalAuthBypass(c.req.raw, c.env.LOCAL_AUTH_BYPASS) });
});

export const navigationAuthRoute = new Hono<{ Bindings: Env }>();

navigationAuthRoute.get('/', async (c) => {
	if (!hasAuthSecret(c.env) || !isValidNavigationToken(c.req.query('token'), c.env.NAVIGATION_TOKEN)) {
		return c.json({ error: 'Invalid navigation token' }, 401);
	}

	await issueSession(c);
	return c.redirect('/');
});
