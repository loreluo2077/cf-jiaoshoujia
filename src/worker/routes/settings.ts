import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createDb } from '../../db/client';
import { appSettings } from '../../db/schema';

export const settingsRoutes = new Hono<{ Bindings: Env }>();

settingsRoutes.get('/', async (c) => {
	const db = createDb(c.env.DB);
	const key = c.req.query('key');
	const rows = key
		? await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
		: await db.select().from(appSettings);

	return c.json({ settings: rows });
});

settingsRoutes.put('/:key', async (c) => {
	const key = c.req.param('key');
	const body = await c.req.json<{ value?: unknown }>();

	if (typeof body.value !== 'string' || body.value.trim() === '') {
		return c.json({ error: 'value must be a non-empty string' }, 400);
	}

	const now = new Date();
	const db = createDb(c.env.DB);
	await db
		.insert(appSettings)
		.values({ key, value: body.value, updatedAt: now })
		.onConflictDoUpdate({
			target: appSettings.key,
			set: { value: body.value, updatedAt: now },
		});

	const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);

	return c.json({ setting });
});
