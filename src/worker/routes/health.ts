import { Hono } from 'hono';

export const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get('/', (c) =>
	c.json({
		status: 'ok',
		service: 'jiaoshoujia',
		timestamp: new Date().toISOString(),
	}),
);
