import { Hono } from 'hono';
import { AdminService } from '../../services/admin-service';

export const adminExtraRoutes = new Hono<{ Bindings: Env }>();

adminExtraRoutes.patch('/providers/:id', async (c) => {
	const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim();
	if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
	if (b.config && typeof b.config === 'object') patch.config = JSON.stringify(b.config);
	await new AdminService(c.env).updateProvider(c.req.param('id'), patch);
	return c.json({ ok: true });
});

adminExtraRoutes.delete('/providers/:id', async (c) => {
	const result = await new AdminService(c.env).deleteProvider(c.req.param('id'));
	if (result.kind === 'missing') return c.json({ error: 'Provider not found' }, 404);
	if (result.kind === 'has-orders') return c.json({ error: 'Provider has orders and cannot be deleted; disable it instead' }, 409);
	return c.json({ ok: true });
});
