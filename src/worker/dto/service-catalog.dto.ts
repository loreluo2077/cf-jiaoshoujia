// 服务目录相关类型

export type ServiceStatus = 'planned' | 'migrating' | 'ready';

export type Service = {
	id: string;
	name: string;
	stack: string;
	status: ServiceStatus;
	nextStep: string;
};
