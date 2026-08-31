import type { PaymentNotification, PaymentProvider, PaymentRequest, PaymentResult } from '../core/types';
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(message: string, secret: string) {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}
export class StripeProvider implements PaymentProvider {
	readonly key = 'stripe';
	constructor(private readonly config: { secretKey: string; webhookSecret: string; apiBase?: string }) {}
	supports(type: string) {
		return type === 'stripe';
	}
	async createPayment(request: PaymentRequest): Promise<PaymentResult> {
		const form = new URLSearchParams({
			amount: String(Math.round(request.amount * 100)),
			currency: 'cny',
			description: request.subject,
			'metadata[orderId]': request.orderId,
			'automatic_payment_methods[enabled]': 'true',
		});
		const response = await fetch(`${this.config.apiBase || 'https://api.stripe.com'}/v1/payment_intents`, {
			method: 'POST',
			headers: { authorization: `Bearer ${this.config.secretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
			body: form,
		});
		if (!response.ok) throw new Error(`Stripe API returned ${response.status}`);
		const data = (await response.json()) as { id: string; client_secret?: string };
		return { tradeNo: data.id, clientSecret: data.client_secret };
	}
	async verifyNotification(body: string, headers?: Headers): Promise<PaymentNotification> {
		const raw = headers?.get('stripe-signature') || '';
		const timestamp = raw.match(/(?:^|,)t=(\d+)/)?.[1];
		const signature = raw.match(/(?:^|,)v1=([a-f0-9]+)/)?.[1];
		if (!timestamp || !signature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
			throw new Error('Invalid Stripe signature timestamp');
		const expected = await hmac(`${timestamp}.${body}`, this.config.webhookSecret);
		if (expected !== signature) throw new Error('Stripe webhook signature verification failed');
		const event = JSON.parse(body) as {
			type?: string;
			data?: { object?: { id?: string; amount?: number; metadata?: { orderId?: string }; status?: string } };
		};
		const object = event.data?.object;
		if (!object?.metadata?.orderId || !object.id || !object.amount) throw new Error('Invalid Stripe event');
		return {
			orderId: object.metadata.orderId,
			tradeNo: object.id,
			amount: object.amount / 100,
			status: event.type === 'payment_intent.succeeded' ? 'success' : 'failed',
		};
	}
	async refund(paymentIntent: string, amount: number) {
		const response = await fetch(`${this.config.apiBase || 'https://api.stripe.com'}/v1/refunds`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${this.config.secretKey}`,
				'content-type': 'application/x-www-form-urlencoded',
				'Idempotency-Key': `mini-pay:refund:${paymentIntent}:${amount}`,
			},
			body: new URLSearchParams({ payment_intent: paymentIntent, amount: String(Math.round(amount * 100)) }),
		});
		if (!response.ok) throw new Error(`Stripe refund failed (${response.status})`);
	}
}
