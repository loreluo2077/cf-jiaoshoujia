import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { HTTPException } from 'hono/http-exception';
import { BusinessException } from './errors/app';
import type { WorkerEnv } from './types';
import { healthRoutes } from './controllers/health';
import { serviceRoutes } from './controllers/services';
import { settingsRoutes } from './controllers/settings';
import { authRoutes, navigationAuthRoute } from './controllers/auth';
import { requireAuth } from './middleware/middleware';

const app = new Hono<WorkerEnv>();

app.use('*', requestId());
app.use('*', logger());
app.use('/api/*', cors());

app.route('/api/health', healthRoutes);
app.route('/api/auth', authRoutes);

app.use('/api/services', requireAuth);
app.use('/api/services/*', requireAuth);
app.use('/api/settings', requireAuth);
app.use('/api/settings/*', requireAuth);

app.route('/api/services', serviceRoutes);
app.route('/api/settings', settingsRoutes);

app.route('/auth/callback', navigationAuthRoute);

app.notFound((c) => c.json({ error: 'NOT_FOUND', message: '资源不存在' }, 404));

app.onError((error, c) => {
	const requestId = c.get('requestId');
	if (error instanceof HTTPException) return error.getResponse();
	if (error instanceof BusinessException) {
		console.error(`[${requestId}][BusinessException]:${error.code}`);
		return c.json({ error: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) }, error.status as 500);
	}
	console.error(`[${requestId}][UnhandledException]:${error instanceof Error ? error.name : 'UnknownError'}`);
	return c.json({ error: 'INTERNAL_SERVER_ERROR', message: '服务暂时不可用' }, 500);
});

export default app;
