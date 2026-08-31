import type { Service } from '../dto/service-catalog.dto';

export class ServiceCatalogService {
	list(): Service[] {
		return [
			{
				id: 'payment-gateway',
				name: '支付网关',
				stack: 'Cloudflare Workers + D1',
				status: 'ready',
				nextStep: '持续优化',
			},
			{
				id: 'admin-panel',
				name: '管理后台',
				stack: 'React + TypeScript',
				status: 'ready',
				nextStep: '功能完善',
			},
		];
	}

	findById(id: string): Service | undefined {
		return this.list().find(s => s.id === id);
	}
}
