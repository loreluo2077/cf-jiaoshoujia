import { Hono } from 'hono';
import { createDb } from '../../../db/client';
import { OrderRepository } from '../../repositories/order';
import { ProviderRepository } from '../../repositories/provider';

export const adminExtraRoutes = new Hono<{ Bindings: Env }>();

adminExtraRoutes.patch('/providers/:id', async (c) => {
	const b = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (typeof b.name === 'string' && b.name.trim()) patch.name = b.name.trim();
	if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
	if (b.config && typeof b.config === 'object') patch.config = JSON.stringify(b.config);
	const db = createDb(c.env.DB);
	const providerDao = new ProviderRepository(db);
	await providerDao.update(c.req.param('id'), patch);
	return c.json({ ok: true });
});

adminExtraRoutes.delete('/providers/:id', async (c) => {
	const db = createDb(c.env.DB);
	const providerDao = new ProviderRepository(db);
	const orderDao = new OrderRepository(db);
	const provider = await providerDao.findById(c.req.param('id'));
	if (!provider) return c.json({ error: 'Provider not found' }, 404);
	const hasOrders = await orderDao.hasProviderOrders(provider.id);
	if (hasOrders) return c.json({ error: 'Provider has orders and cannot be deleted; disable it instead' }, 409);
	await providerDao.delete(provider.id);
	return c.json({ ok: true });
});
