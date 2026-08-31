// Gateway 相关类型和常量

export const GATEWAY_PROVIDER = {
	XUNHUPAY: 'xunhupay',
	ALIPAY: 'alipay',
	WXPAY: 'wxpay',
	STRIPE: 'stripe',
} as const;

export type GatewayProvider = (typeof GATEWAY_PROVIDER)[keyof typeof GATEWAY_PROVIDER];

export const GATEWAY_RESULT_CODE = {
	ACCEPTED: 'ACCEPTED',
	PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
	INVALID_NOTIFICATION: 'INVALID_NOTIFICATION',
	ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
	ORDER_MISMATCH: 'ORDER_MISMATCH',
} as const;

export const GATEWAY_PROVIDER_KEYS = {
	[GATEWAY_PROVIDER.ALIPAY]: ['alipay'],
	[GATEWAY_PROVIDER.WXPAY]: ['wxpay'],
	[GATEWAY_PROVIDER.STRIPE]: ['stripe'],
} as const;

export const LOCAL_GATEWAY_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);
export const LOCAL_GENERIC_PROVIDER_BASE_URL = 'http://localhost';

export type GatewayResult =
	| {
			code: typeof GATEWAY_RESULT_CODE.ACCEPTED;
			orderId: string;
			claimed: boolean;
			paymentStatus: 'PAID' | 'FAILED';
	  }
	| { code: typeof GATEWAY_RESULT_CODE.PROVIDER_NOT_CONFIGURED }
	| { code: typeof GATEWAY_RESULT_CODE.INVALID_NOTIFICATION }
	| { code: typeof GATEWAY_RESULT_CODE.ORDER_NOT_FOUND; orderId: string }
	| { code: typeof GATEWAY_RESULT_CODE.ORDER_MISMATCH; orderId: string };

export interface GatewayNotificationRequest {
	provider: GatewayProvider;
	providerKey?: string;
	body: string;
	headers: Headers;
	requestUrl: string;
}

export type VerifiedNotification = {
	notification: {
		orderId: string;
		tradeNo: string;
		amount: number;
		status: string;
	};
	instance?: {
		id: string;
		providerKey: string;
		[key: string]: any;
	};
};
