import { Hono } from 'hono';
import { AdminService } from '../../services/admin-service';
import { log } from '../../utils/controller-logger';
import type { WorkerEnv } from '../../types';
import { notFound } from '../../errors/http';

export const adminExtraRoutes = new Hono<WorkerEnv>();

const getService = (env: Env) => new AdminService(env);

const deleteErrorMap = {
	missing: { status: 404, error: 'Provider not found' },
	'has-orders': { status: 409, error: 'Provider has orders and cannot be deleted; disable it instead' },
} as const;

adminExtraRoutes.patch('/providers/:id', async (c) => {
	const id = c.req.param('id');
	log('AdminExtraController', '入参', c.get('requestId'), { id: { present: id.length > 0 } });

	const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim();
	if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
	if (b.config && typeof b.config === 'object') patch.config = JSON.stringify(b.config);

	await getService(c.env).updateProvider(id, patch);
	log('AdminExtraController', '出参', c.get('requestId'), { ok: true });
	return c.json({ ok: true });
});

adminExtraRoutes.delete('/providers/:id', async (c) => {
	const id = c.req.param('id');
	log('AdminExtraController', '入参', c.get('requestId'), { id: { present: id.length > 0 } });

	const result = await getService(c.env).deleteProvider(id);

	if (result.kind !== 'deleted') {
		const errorConfig = deleteErrorMap[result.kind];
		log('AdminExtraController', '出参', c.get('requestId'), { error: result.kind.toUpperCase() });
		if (result.kind === 'missing') throw notFound(errorConfig.error);
		return c.json({ error: errorConfig.error }, errorConfig.status);
	}

	log('AdminExtraController', '出参', c.get('requestId'), { ok: true });
	return c.json({ ok: true });
});
