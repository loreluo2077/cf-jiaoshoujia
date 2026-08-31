import type { PaymentNotification, PaymentProvider, PaymentRequest, PaymentResult } from '../core/types';

/** Generic HTTP adapter for providers configured through PAYMENT_API_BASE. */
export class GenericHttpProvider implements PaymentProvider {
	readonly key = 'http';
	constructor(
		private readonly baseUrl: string,
		private readonly secret?: string,
	) {}
	supports(type: string) {
		return Boolean(type);
	}
	async createPayment(request: PaymentRequest): Promise<PaymentResult> {
		const response = await fetch(new URL('/payments', this.baseUrl), {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(this.secret ? { authorization: `Bearer ${this.secret}` } : {}) },
			body: JSON.stringify(request),
		});
		if (!response.ok) throw new Error(`payment provider returned ${response.status}`);
		return (await response.json()) as PaymentResult;
	}
	async verifyNotification(body: string, headers: Headers): Promise<PaymentNotification> {
		if (this.secret) {
			const supplied = headers.get('x-payment-signature') || '';
			const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${this.secret}.${body}`));
			const expected = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
			if (supplied !== expected) throw new Error('invalid payment signature');
		}
		const payload = JSON.parse(body) as Partial<PaymentNotification>;
		const amount = Number(payload.amount);
		if (!payload.orderId || !payload.tradeNo || !Number.isFinite(amount) || amount <= 0) throw new Error('invalid payment notification');
		return { orderId: payload.orderId, tradeNo: payload.tradeNo, amount, status: payload.status === 'failed' ? 'failed' : 'success' };
	}
	async refund(paymentTradeNo: string, orderId: string, amount: number) {
		const response = await fetch(new URL(`/payments/${encodeURIComponent(paymentTradeNo)}/refund`, this.baseUrl), {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(this.secret ? { authorization: `Bearer ${this.secret}`, 'x-payment-secret': this.secret } : {}),
			},
			body: JSON.stringify({ amount: amount.toFixed(2), orderId }),
		});
		if (!response.ok) throw new Error(`Payment provider refund failed (${response.status})`);
	}
}
