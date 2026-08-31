import { BusinessException, type AppErrorCode } from './app';

export class ServiceError extends BusinessException {
	constructor(message: string, status: number, code: AppErrorCode = 'BUSINESS_ERROR', details?: unknown) {
		super(code, message, status, details);
		this.name = 'ServiceError';
	}
}
