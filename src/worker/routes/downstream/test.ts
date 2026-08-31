import { Hono } from 'hono';
import { TestService } from '../../services/test-service';
import { log } from '../../utils/controller-logger';
import type { WorkerEnv } from '../../types';

export const downstreamTestRoutes = new Hono<WorkerEnv>();

const getService = (env: Env) => new TestService(env);

const errorMap: Record<string, { status: number; response: string }> = {
	NOT_CONFIGURED: { status: 503, response: 'fail' },
	INVALID_PID: { status: 400, response: 'fail' },
	INVALID_STATUS: { status: 400, response: 'fail' },
	INVALID_SIGNATURE: { status: 400, response: 'fail' },
};

downstreamTestRoutes.post('/notify', async (c) => {
	const body = await c.req.text();
	log('DownstreamTestController', '入参', c.get('requestId'), { bodyLength: body.length });
	const params = Object.fromEntries(new URLSearchParams(body));

	const result = getService(c.env).verifyTestNotification(params);

	if (!result.ok) {
		const error = errorMap[result.code];
		log('DownstreamTestController', '出参', c.get('requestId'), { error: result.code });
		return c.text(error.response, error.status as any);
	}

	log('DownstreamTestController', '出参', c.get('requestId'), { success: true });
	return c.text('success');
});
