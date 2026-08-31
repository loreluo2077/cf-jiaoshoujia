import type { PaymentNotification, PaymentProvider, PaymentRequest, PaymentResult } from '../core/types';

function pemBytes(value: string) {
	const body = value.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
	const bin = atob(body);
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function b64(value: ArrayBuffer | Uint8Array) {
	return btoa(String.fromCharCode(...new Uint8Array(value)));
}
async function sign(value: string, privateKey: string) {
	const key = await crypto.subtle.importKey('pkcs8', pemBytes(privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
	return b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(value)));
}
async function verify(value: string, signature: string, publicKey: string) {
	const key = await crypto.subtle.importKey('spki', pemBytes(publicKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
	return crypto.subtle.verify(
		'RSASSA-PKCS1-v1_5',
		key,
		Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)),
		new TextEncoder().encode(value),
	);
}
async function decrypt(ciphertext: string, associatedData: string, nonce: string, keyText: string) {
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(keyText), 'AES-GCM', false, ['decrypt']);
	const bytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
	const plain = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: new TextEncoder().encode(nonce), additionalData: new TextEncoder().encode(associatedData), tagLength: 128 },
		key,
		bytes,
	);
	return new TextDecoder().decode(plain);
}

export class WxpayProvider implements PaymentProvider {
	readonly key = 'wxpay';
	constructor(
		private readonly config: {
			appId: string;
			mchId: string;
			privateKey: string;
			apiV3Key: string;
			certSerial: string;
			publicKey: string;
			publicKeyId?: string;
			apiBase?: string;
		},
	) {}
	supports(type: string) {
		return type === 'wxpay_direct';
	}
	private async request(path: string, method: string, body?: string) {
		const timestamp = Math.floor(Date.now() / 1000).toString();
		const nonce = crypto.randomUUID().replaceAll('-', '');
		const signature = await sign(`${method}\n${path}\n${timestamp}\n${nonce}\n${body || ''}\n`, this.config.privateKey);
		const response = await fetch(`${this.config.apiBase || 'https://api.mch.weixin.qq.com'}${path}`, {
			method,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				Authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${this.config.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${this.config.certSerial}",signature="${signature}"`,
			},
			body,
		});
		if (!response.ok) throw new Error(`Wechat Pay API returned ${response.status}`);
		return response.json() as Promise<Record<string, unknown>>;
	}
	async createPayment(request: PaymentRequest): Promise<PaymentResult> {
		const data = await this.request(
			'/v3/pay/transactions/native',
			'POST',
			JSON.stringify({
				appid: this.config.appId,
				mchid: this.config.mchId,
				description: request.subject,
				out_trade_no: request.orderId,
				notify_url: request.notifyUrl,
				amount: { total: Math.round(request.amount * 100), currency: 'CNY' },
			}),
		);
		return { tradeNo: request.orderId, qrCode: String(data.code_url || '') };
	}
	async refund(orderId: string, amount: number, total: number) {
		await this.request(
			'/v3/refund/domestic/refunds',
			'POST',
			JSON.stringify({
				out_trade_no: orderId,
				out_refund_no: `refund-${orderId}-${Date.now()}`,
				reason: 'admin refund',
				amount: { refund: Math.round(amount * 100), total: Math.round(total * 100), currency: 'CNY' },
			}),
		);
	}
	async verifyNotification(body: string, headers?: Headers): Promise<PaymentNotification> {
		const timestamp = headers?.get('wechatpay-timestamp') || '';
		const nonce = headers?.get('wechatpay-nonce') || '';
		const signature = headers?.get('wechatpay-signature') || '';
		const serial = headers?.get('wechatpay-serial') || '';
		const ts = Number(timestamp);
		const expectedSerial = this.config.publicKeyId || this.config.certSerial;
		if (
			!timestamp ||
			!nonce ||
			!signature ||
			!serial ||
			!Number.isFinite(ts) ||
			Math.abs(Date.now() / 1000 - ts) > 300 ||
			(expectedSerial && serial !== expectedSerial)
		)
			throw new Error('Invalid Wechat Pay signature headers');
		if (new TextEncoder().encode(this.config.apiV3Key).length !== 32) throw new Error('Wechat Pay API v3 key must be 32 bytes');
		if (!(await verify(`${timestamp}\n${nonce}\n${body}\n`, signature, this.config.publicKey)))
			throw new Error('Wechat Pay signature verification failed');
		const event = JSON.parse(body) as { event_type?: string; resource?: { ciphertext: string; associated_data: string; nonce: string } };
		if (event.event_type !== 'TRANSACTION.SUCCESS' || !event.resource) throw new Error('Unsupported Wechat Pay event');
		const payload = JSON.parse(
			await decrypt(event.resource.ciphertext, event.resource.associated_data, event.resource.nonce, this.config.apiV3Key),
		) as { out_trade_no: string; transaction_id: string; trade_state: string; amount: { total: number } };
		return {
			orderId: payload.out_trade_no,
			tradeNo: payload.transaction_id,
			amount: payload.amount.total / 100,
			status: payload.trade_state === 'SUCCESS' ? 'success' : 'failed',
		};
	}
}
