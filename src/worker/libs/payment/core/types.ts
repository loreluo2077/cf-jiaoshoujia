export type PaymentType = 'alipay' | 'alipay_direct' | 'wxpay' | 'wxpay_direct' | 'stripe' | string;
export interface PaymentRequest {
	orderId: string;
	amount: number;
	subject: string;
	paymentType: PaymentType;
	notifyUrl: string;
	returnUrl: string;
}
export interface PaymentResult {
	tradeNo: string;
	payUrl?: string;
	qrCode?: string;
	clientSecret?: string;
}
export interface PaymentNotification {
	orderId: string;
	tradeNo: string;
	amount: number;
	status: 'success' | 'failed';
}
export interface PaymentProvider {
	readonly key: string;
	supports(type: PaymentType): boolean;
	createPayment(request: PaymentRequest): Promise<PaymentResult>;
	verifyNotification(body: string, headers?: Headers): Promise<PaymentNotification>;
}
