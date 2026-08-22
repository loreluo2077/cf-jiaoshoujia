import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { healthRoutes } from './routes/health';
import { serviceRoutes } from './routes/services';
import { settingsRoutes } from './routes/settings';
import { authRoutes, navigationAuthRoute } from './routes/auth';
import { requireAuth } from './auth/middleware';

const app = new Hono<{ Bindings: Env }>();

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

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

export default app;
