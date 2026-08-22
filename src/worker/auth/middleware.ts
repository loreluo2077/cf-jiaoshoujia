import type { MiddlewareHandler } from 'hono';
import { hasValidSession } from './session';
import { isValidApiToken } from './token';

export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
	if (await hasValidSession(c) || isValidApiToken(c.req.raw, c.env.API_TOKEN)) return next();
	return c.json({ error: 'Unauthorized' }, 401);
};
