import type { MiddlewareHandler } from 'hono';
import { hasValidSession } from '../libs/auth/session';
import { AuthService } from '../services/auth';
import type { WorkerEnv } from '../types';
import { unauthorized } from '../errors/http';

const authService = new AuthService();

export const requireAuth: MiddlewareHandler<WorkerEnv> = async (c, next) => {
	const localBypass = authService.isLocalBypass(c.req.raw, c.env.LOCAL_AUTH_BYPASS);
	const session = await hasValidSession(c);
	const apiToken = authService.validateApiRequest(c.req.raw, c.env.API_TOKEN);
	if (localBypass || session || apiToken) return next();
	throw unauthorized();
};
