import { Hono } from 'hono';
import type { WorkerEnv } from '../types';

export const healthRoutes = new Hono<WorkerEnv>();

healthRoutes.get('/', (c) =>
	c.json({
		status: 'ok',
		service: 'jiaoshoujia',
		timestamp: new Date().toISOString(),
	}),
);
