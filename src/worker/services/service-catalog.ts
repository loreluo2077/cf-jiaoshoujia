export type ServiceStatus = 'planned' | 'migrating' | 'ready';

export type Service = {
	id: string;
	name: string;
	stack: string;
	status: ServiceStatus;
	nextStep: string;
};

const services: Service[] = [
	{
		id: 'image-bed',
		name: 'CloudFlare-ImgBed',
		stack: 'Pages Functions + R2 + KV',
		status: 'planned',
		nextStep: '迁移上传、管理 API 和 R2/KV bindings',
	},
	{
		id: 'card-life',
		name: 'card-life',
		stack: 'React + TanStack Start + D1',
		status: 'planned',
		nextStep: '迁移页面路由、认证和 D1 数据访问',
	},
	{
		id: 'llm-proxy',
		name: 'go-llm-proxy',
		stack: 'Go + SQLite',
		status: 'planned',
		nextStep: '先定义 Hono API 合约，再按模块迁移代理逻辑',
	},
];

export class ServiceCatalogService {
	list(): Service[] {
		return services;
	}

	findById(id: string): Service | undefined {
		return services.find((service) => service.id === id);
	}
}
