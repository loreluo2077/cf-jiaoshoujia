import { describe, expect, it } from 'vitest';
import { sign } from '../src/worker/payment/downstream/easypay';
import { AlipayProvider } from '../src/worker/payment/upstream/alipay';
import { WxpayProvider } from '../src/worker/payment/upstream/wxpay';
import { StripeProvider } from '../src/worker/payment/upstream/stripe';
import { selectPaymentProvider } from '../src/worker/payment/providers';
import { XunhuPayProvider, xunhuSign } from '../src/worker/payment/upstream/xunhupay';

describe('EasyPay signing', () => {
	it('sorts parameters and excludes protocol fields', () => {
		expect(sign({ money: '10.00', pid: '1001', sign: 'ignored', type: 'alipay' }, 'secret')).toBe('31a5f99ac1b73d40b5664d691ca5bcaa');
	});
});

describe('provider notification boundaries', () => {
	it('generates XunhuPay hash signatures', () => {
		expect(xunhuSign({ appid: 'test', nonce_str: 'abc', time: '1700000000', total_fee: '9.90' }, 'mysecret')).toBe(
			'bfdeff96bd42295c988d3412a0de4737',
		);
	});
	it('accepts XunhuPay payment URLs returned at the top level', async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					errcode: 0,
					errmsg: 'success!',
					url: 'https://pay.example/redirect',
					url_qrcode: 'https://pay.example/qr',
					open_order_id: 'HPJ-1',
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } },
			)) as typeof fetch;
		try {
			const provider = new XunhuPayProvider({
				appid: 'app',
				secret: 'secret',
				gateway: 'https://pay.example',
				notifyUrl: 'https://merchant.example/notify',
			});
			await expect(
				provider.createPayment({
					orderId: 'order-1',
					amount: 9.9,
					subject: 'test',
					paymentType: 'alipay',
					notifyUrl: 'https://merchant.example/notify',
				}),
			).resolves.toMatchObject({ tradeNo: 'HPJ-1', payUrl: 'https://pay.example/redirect', qrCode: 'https://pay.example/qr' });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
	it('rejects XunhuPay notifications for another merchant', async () => {
		const provider = new XunhuPayProvider({ appid: 'expected-app', secret: 'secret', gateway: 'https://pay.example', notifyUrl: '' });
		const notification: Record<string, string> = {
			appid: 'other-app',
			trade_order_id: 'order-1',
			transaction_id: 'transaction-1',
			total_fee: '1.00',
			status: 'OD',
		};
		notification.hash = xunhuSign(notification, 'secret');
		await expect(provider.verifyNotification(new URLSearchParams(notification).toString())).rejects.toThrow(/merchant mismatch/);
	});
	it('rejects malformed Alipay notifications before touching the database', async () => {
		const provider = new AlipayProvider({ appId: 'app', privateKey: '', publicKey: '', notifyUrl: '', returnUrl: '' });
		await expect(provider.verifyNotification('out_trade_no=order&total_amount=1')).rejects.toThrow(/missing sign/);
	});

	it('rejects stale Stripe webhook signatures', async () => {
		const provider = new StripeProvider({ secretKey: 'sk_test', webhookSecret: 'whsec_test' });
		const headers = new Headers({ 'stripe-signature': 't=1,v1=deadbeef' });
		await expect(provider.verifyNotification('{}', headers)).rejects.toThrow(/timestamp/);
	});

	it('rejects Wechat notifications without the required signed headers', async () => {
		const provider = new WxpayProvider({
			appId: 'app',
			mchId: 'mch',
			privateKey: '',
			apiV3Key: '12345678901234567890123456789012',
			certSerial: 'serial',
			publicKey: '',
		});
		await expect(provider.verifyNotification('{}', new Headers())).rejects.toThrow(/signature headers/);
	});
});

describe('provider routing', () => {
	it('honors supported types, amount limits, and priority', () => {
		const rows = [
			{
				id: 'high',
				providerKey: 'http',
				config: '{"baseUrl":"https://high.example"}',
				supportedTypes: 'stripe',
				enabled: true,
				sortOrder: 1,
				limits: '{"minAmount":100}',
				createdAt: new Date(),
			},
			{
				id: 'low',
				providerKey: 'http',
				config: '{"baseUrl":"https://low.example"}',
				supportedTypes: 'stripe',
				enabled: true,
				sortOrder: 2,
				limits: '{"maxAmount":50}',
				createdAt: new Date(),
			},
		] as any;
		expect(selectPaymentProvider(rows, 'stripe', 20, 'https://example.com')?.instance.id).toBe('low');
		expect(selectPaymentProvider(rows, 'stripe', 120, 'https://example.com')?.instance.id).toBe('high');
	});
});
