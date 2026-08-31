import type { MiddlewareHandler } from 'hono';
import { hasLocalAuthBypass } from '../auth/local';
import { hasValidSession } from '../auth/session';
import { isValidApiToken } from '../auth/token';
import type { WorkerEnv } from '../types';
import { unauthorized } from '../errors/http';

export const requireAuth: MiddlewareHandler<WorkerEnv> = async (c, next) => {
	if (hasLocalAuthBypass(c.req.raw, c.env.LOCAL_AUTH_BYPASS) || (await hasValidSession(c)) || isValidApiToken(c.req.raw, c.env.API_TOKEN)) {
		return next();
	}
	throw unauthorized();
};

export const requireSessionAuth: MiddlewareHandler<WorkerEnv> = async (c, next) => {
	if (hasLocalAuthBypass(c.req.raw, c.env.LOCAL_AUTH_BYPASS) || (await hasValidSession(c))) return next();
	throw unauthorized();
};
