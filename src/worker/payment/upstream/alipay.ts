import type { PaymentNotification, PaymentProvider, PaymentRequest, PaymentResult } from '../core/types';

function pemToBytes(pem: string) {
	const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
	const bin = atob(body);
	return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
function encode(value: string) {
	return encodeURIComponent(value)
		.replace(/!/g, '%21')
		.replace(/'/g, '%27')
		.replace(/\(/g, '%28')
		.replace(/\)/g, '%29')
		.replace(/\*/g, '%2A');
}
async function rsaSign(content: string, privateKey: string) {
	const key = await crypto.subtle.importKey('pkcs8', pemToBytes(privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
		'sign',
	]);
	const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(content));
	return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
async function rsaVerify(content: string, signature: string, publicKey: string) {
	const key = await crypto.subtle.importKey('spki', pemToBytes(publicKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
		'verify',
	]);
	return crypto.subtle.verify(
		'RSASSA-PKCS1-v1_5',
		key,
		Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)),
		new TextEncoder().encode(content),
	);
}

export class AlipayProvider implements PaymentProvider {
	readonly key = 'alipay';
	constructor(
		private readonly config: {
			appId: string;
			privateKey: string;
			publicKey: string;
			notifyUrl: string;
			returnUrl: string;
			gateway?: string;
		},
	) {}
	supports(type: string) {
		return type === 'alipay_direct';
	}
	async createPayment(request: PaymentRequest): Promise<PaymentResult> {
		const gateway = this.config.gateway || 'https://openapi.alipay.com/gateway.do';
		const biz = JSON.stringify({
			out_trade_no: request.orderId,
			product_code: 'FAST_INSTANT_TRADE_PAY',
			total_amount: request.amount.toFixed(2),
			subject: request.subject,
		});
		const params: Record<string, string> = {
			app_id: this.config.appId,
			method: 'alipay.trade.page.pay',
			format: 'JSON',
			charset: 'utf-8',
			sign_type: 'RSA2',
			timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
			version: '1.0',
			notify_url: request.notifyUrl || this.config.notifyUrl,
			return_url: request.returnUrl || this.config.returnUrl,
			biz_content: biz,
		};
		const canonical = Object.keys(params)
			.sort()
			.map((k) => `${k}=${encode(params[k])}`)
			.join('&');
		const sign = await rsaSign(canonical, this.config.privateKey);
		const query = `${canonical}&sign=${encode(sign)}`;
		return { tradeNo: request.orderId, payUrl: `${gateway}?${query}` };
	}
	async verifyNotification(body: string): Promise<PaymentNotification> {
		const params = Object.fromEntries(new URLSearchParams(body));
		const signature = params.sign;
		if (!signature) throw new Error('Alipay notification missing sign');
		const canonical = Object.keys(params)
			.filter((k) => !['sign', 'sign_type'].includes(k) && params[k] !== '')
			.sort()
			.map((k) => `${k}=${params[k]}`)
			.join('&');
		if (!(await rsaVerify(canonical, signature, this.config.publicKey)))
			throw new Error('Alipay notification signature verification failed');
		const amount = Number(params.total_amount);
		if (!params.out_trade_no || !params.trade_no || !Number.isFinite(amount)) throw new Error('Invalid Alipay notification');
		return {
			orderId: params.out_trade_no,
			tradeNo: params.trade_no,
			amount,
			status: ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(params.trade_status) ? 'success' : 'failed',
		};
	}
	async refund(orderId: string, amount: number) {
		const params: Record<string, string> = {
			app_id: this.config.appId,
			method: 'alipay.trade.refund',
			format: 'JSON',
			charset: 'utf-8',
			sign_type: 'RSA2',
			timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
			version: '1.0',
			biz_content: JSON.stringify({ out_trade_no: orderId, refund_amount: amount.toFixed(2) }),
		};
		const canonical = Object.keys(params)
			.sort()
			.map((k) => `${k}=${encode(params[k])}`)
			.join('&');
		const response = await fetch(this.config.gateway || 'https://openapi.alipay.com/gateway.do', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ ...params, sign: await rsaSign(canonical, this.config.privateKey) }),
		});
		const data = (await response.json()) as { alipay_trade_refund_response?: { code?: string; msg?: string } };
		if (data.alipay_trade_refund_response?.code !== '10000')
			throw new Error(data.alipay_trade_refund_response?.msg || 'Alipay refund failed');
	}
}
