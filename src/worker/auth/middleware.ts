import type { MiddlewareHandler } from 'hono';
import { hasLocalAuthBypass } from './local';
import { hasValidSession } from './session';
import { isValidApiToken } from './token';

export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	if (hasLocalAuthBypass(c.req.raw, c.env.LOCAL_AUTH_BYPASS) || await hasValidSession(c) || isValidApiToken(c.req.raw, c.env.API_TOKEN)) return next();
	return c.json({ error: 'Unauthorized' }, 401);
};
