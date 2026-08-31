import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { HTTPException } from 'hono/http-exception';
import { BusinessException } from './errors/app';
import type { WorkerEnv } from './types';
import { healthRoutes } from './routes/health';
import { serviceRoutes } from './routes/services';
import { settingsRoutes } from './routes/settings';
import { authRoutes, navigationAuthRoute } from './routes/auth';
import { requireAuth, requireSessionAuth } from './middle/middleware';
import { gatewayRoutes } from './routes/gateway/index';
import { adminGatewayRoutes } from './routes/admin/index';
import { adminExtraRoutes } from './routes/admin/extra';
import { easyPayBridgeRoutes } from './routes/downstream/easypay';
import { downstreamTestRoutes } from './routes/downstream/test';
import { createDb } from '../db/client';
import { OrderRepository } from './repositories/order';
import { deliverPaidOrder } from './services/order-delivery-service';

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
app.route('/api/gateway', gatewayRoutes);
app.route('/api/easypay', easyPayBridgeRoutes);
app.route('/api/downstream/test', downstreamTestRoutes);
app.use('/api/admin/payment-tests/*', requireSessionAuth);
app.use('/api/admin/*', requireAuth);
app.route('/api/admin', adminGatewayRoutes);
app.route('/api/admin', adminExtraRoutes);
app.route('/auth/callback', navigationAuthRoute);

app.notFound((c) => c.json({ error: 'NOT_FOUND', message: '资源不存在' }, 404));

app.onError((error, c) => {
	const requestId = c.get('requestId');
	if (error instanceof HTTPException) return error.getResponse();
	if (error instanceof BusinessException) {
		console.error(`[${requestId}][BusinessException]:${error.code}`);
		return c.json(
			{ error: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) },
			error.status as 500,
		);
	}
	console.error(`[${requestId}][UnhandledException]:${error instanceof Error ? error.name : 'UnknownError'}`);
	return c.json({ error: 'INTERNAL_SERVER_ERROR', message: '服务暂时不可用' }, 500);
});

export default {
	fetch: app.fetch,
	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(
			(async () => {
				const db = createDb(env.DB);
				const orderRepository = new OrderRepository(db);
				const now = new Date();
				await orderRepository.expirePending(now);
				const retryable = await orderRepository.findRetryable(20);
				for (const order of retryable) await deliverPaidOrder(env, order, db);
			})(),
		);
	},
};
