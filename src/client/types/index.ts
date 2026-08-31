export type OrderStatus = 'PENDING' | 'PAID' | 'RECHARGING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type RefundStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Order {
	id: string;
	userId: string;
	orderType: string;
	subject: string;
	amount: string;
	payAmount: string;
	paymentType: string;
	status: OrderStatus;
	paymentStatus: PaymentStatus;
	paymentTradeNo: string | null;
	externalOrderNo: string | null;
	externalNotifyUrl: string | null;
	externalReturnUrl: string | null;
	payUrl: string | null;
	qrCode: string | null;
	providerInstanceId: string | null;
	downstreamMerchantId: string | null;
	clientIp: string | null;
	failedReason: string | null;
	refundAmount: string | null;
	createdAt: string;
	updatedAt: string;
	paidAt: string | null;
	refundAt: string | null;
}

export interface Refund {
	id: string;
	orderId: string;
	amount: string;
	status: RefundStatus;
	reason: string | null;
	upstreamRefundNo: string | null;
	failedReason: string | null;
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
}

export interface Provider {
	id: string;
	providerKey: string;
	name: string;
	config: Record<string, any>;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface Merchant {
	id: string;
	code: string;
	protocol: string;
	pid: string;
	secret: string;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface Setting {
	key: string;
	value: string;
	createdAt: string;
	updatedAt: string;
}

export interface OrderWithDetails extends Order {
	provider?: Provider;
	merchant?: Merchant;
	refunds?: Refund[];
}

export type AuthState = 'checking' | 'required' | 'authenticated';
