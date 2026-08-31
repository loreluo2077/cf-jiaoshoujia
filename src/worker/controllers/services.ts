import { Hono } from 'hono';
import { log } from '../utils/controller-logger';
import { ServiceCatalogService } from '../services/service-catalog';
import type { WorkerEnv } from '../types';
import { notFound } from '../errors/http';

export const serviceRoutes = new Hono<WorkerEnv>();
const serviceCatalog = new ServiceCatalogService();

serviceRoutes.get('/', (c) => {
	log('ServiceController', '入参', c.get('requestId'), {});
	const services = serviceCatalog.list();
	log('ServiceController', '出参', c.get('requestId'), { count: services.length });
	return c.json({ services });
});

serviceRoutes.get('/:id', (c) => {
	const id = c.req.param('id');
	log('ServiceController', '入参', c.get('requestId'), { id: { present: id.length > 0, length: id.length } });
	const service = serviceCatalog.findById(id);
	log('ServiceController', '出参', c.get('requestId'), { found: Boolean(service) });
	if (!service) throw notFound('Service not found');
	return c.json(service);
});
