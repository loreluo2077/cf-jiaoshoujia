// 订单相关类型

export interface ManagedOrderRequest {
	amount: number;
	paymentType: string;
	userId: string;
	userEmail?: string;
	appCode?: string;
	appId?: string;
	orderType?: string;
	subject?: string;
	externalOrderNo?: string;
	externalNotifyUrl?: string;
	externalReturnUrl?: string;
	clientIp?: string;
	srcHost?: string;
	srcUrl?: string;
	returnUrlForOrder?: (orderId: string) => string;
	downstreamMerchantId?: string;
}

export type DeliverableOrder = {
	id: string;
	amount: string;
	orderType: string;
	deliveryStatus?: string;
	downstreamMerchantId?: string | null;
	paymentType?: string;
	paymentTradeNo?: string | null;
	externalOrderNo?: string | null;
	externalNotifyUrl?: string | null;
	subject?: string;
};
