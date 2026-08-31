export type AppErrorCode =
	| 'BUSINESS_ERROR'
	| 'SETTING_PERSIST_FAILED'
	| 'APP_NOT_FOUND'
	| 'ORDER_NOT_FOUND'
	| 'ORDER_STATE_CONFLICT'
	| 'PAYMENT_PROVIDER_NOT_CONFIGURED'
	| 'PAYMENT_PROVIDER_FAILED'
	| 'REFUND_NOT_ALLOWED'
	| 'PAYMENT_NOTIFICATION_INVALID'
	| 'PAYMENT_NOTIFICATION_MISMATCH';

export class AppException extends Error {
	readonly code: AppErrorCode;
	readonly status: number;
	readonly details?: unknown;

	constructor(code: AppErrorCode, message: string, status = 500, details?: unknown) {
		super(message);
		this.name = 'AppException';
		this.code = code;
		this.status = status;
		this.details = details;
	}
}

export class BusinessException extends AppException {
	constructor(code: AppErrorCode, message: string, status = 422, details?: unknown) {
		super(code, message, status, details);
		this.name = 'BusinessException';
	}
}
