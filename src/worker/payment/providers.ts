import type { PaymentProviderInstance } from '../../db/schema';
import { AlipayProvider } from './upstream/alipay';
import { EasyPayProvider } from './downstream/easypay';
import { GenericHttpProvider } from './upstream/generic';
import { StripeProvider } from './upstream/stripe';
import { WxpayProvider } from './upstream/wxpay';
import { XunhuPayProvider } from './upstream/xunhupay';

export interface PaymentProviders {
	easyPay?: EasyPayProvider | XunhuPayProvider;
	alipay?: AlipayProvider;
	wxpay?: WxpayProvider;
	stripe?: StripeProvider;
	generic?: GenericHttpProvider;
}

export interface PaymentProviderRoute {
	instance: PaymentProviderInstance;
	provider: NonNullable<PaymentProviders[keyof PaymentProviders]>;
}

function supportsType(instance: PaymentProviderInstance, paymentType: string) {
	const supported = instance.supportedTypes
		.split(',')
		.map((type) => type.trim())
		.filter(Boolean);
	if (supported.length) return supported.includes(paymentType);
	const key = instance.providerKey.toLowerCase();
	return (
		key === 'generic' ||
		key === 'http' ||
		((key === 'xunhupay' || key === 'easypay') && (paymentType === 'alipay' || paymentType === 'wxpay')) ||
		((key === 'alipay' || key === 'alipay_direct') && (paymentType === 'alipay' || paymentType === 'alipay_direct')) ||
		((key === 'wxpay' || key === 'wxpay_direct') && (paymentType === 'wxpay' || paymentType === 'wxpay_direct')) ||
		(key === 'stripe' && paymentType === 'stripe')
	);
}

function withinLimits(instance: PaymentProviderInstance, amount: number) {
	try {
		const limits = JSON.parse(instance.limits || '{}') as { minAmount?: number; maxAmount?: number };
		return (
			(!Number.isFinite(Number(limits.minAmount)) || amount >= Number(limits.minAmount)) &&
			(!Number.isFinite(Number(limits.maxAmount)) || amount <= Number(limits.maxAmount))
		);
	} catch {
		return false;
	}
}

export function selectPaymentProvider(instances: PaymentProviderInstance[], paymentType: string, amount: number, requestUrl: string) {
	const candidates = instances
		.filter((instance) => instance.enabled && supportsType(instance, paymentType) && withinLimits(instance, amount))
		.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
	for (const instance of candidates) {
		const providers = createPaymentProviders([instance], requestUrl);
		const provider = instance.providerKey.toLowerCase();
		const selected =
			provider === 'xunhupay' || provider === 'easypay'
				? providers.easyPay
				: provider === 'alipay' || provider === 'alipay_direct'
					? providers.alipay
					: provider === 'wxpay' || provider === 'wxpay_direct'
						? providers.wxpay
						: provider === 'stripe'
							? providers.stripe
							: providers.generic;
		if (selected) return { instance, provider: selected };
	}
	return undefined;
}

/** Builds configured provider instances from the Worker environment in one place. */
export function createPaymentProviders(instances: PaymentProviderInstance[], requestUrl: string): PaymentProviders {
	const baseUrl = new URL(requestUrl);
	const providers: PaymentProviders = {};
	for (const instance of instances) {
		let config: Record<string, string>;
		try {
			config = JSON.parse(instance.config) as Record<string, string>;
		} catch {
			continue;
		}
		const key = instance.providerKey.toLowerCase();
		if (key === 'xunhupay' && config.appid && config.secret && config.gateway) {
			providers.easyPay = new XunhuPayProvider({
				appid: config.appid,
				secret: config.secret,
				gateway: config.gateway,
				notifyUrl: config.notifyUrl || new URL('/api/gateway/notify/xunhupay', baseUrl).toString(),
				returnUrl: config.returnUrl,
			});
		} else if (key === 'easypay' && config.pid && config.pkey && config.apiBase) {
			providers.easyPay = new EasyPayProvider({
				pid: config.pid,
				pkey: config.pkey,
				apiBase: config.apiBase,
				notifyUrl: config.notifyUrl || new URL('/api/gateway/notify/xunhupay', baseUrl).toString(),
				returnUrl: config.returnUrl || new URL('/pay/result', baseUrl).toString(),
				cid: config.cid,
			});
		} else if ((key === 'alipay' || key === 'alipay_direct') && config.appId && config.privateKey && config.publicKey) {
			providers.alipay = new AlipayProvider({
				appId: config.appId,
				privateKey: config.privateKey,
				publicKey: config.publicKey,
				notifyUrl: config.notifyUrl || new URL('/api/gateway/notify/alipay', baseUrl).toString(),
				returnUrl: config.returnUrl || new URL('/pay/result', baseUrl).toString(),
				gateway: config.gateway,
			});
		} else if (
			(key === 'wxpay' || key === 'wxpay_direct') &&
			config.appId &&
			config.mchId &&
			config.privateKey &&
			config.apiV3Key &&
			config.certSerial &&
			config.publicKey
		) {
			providers.wxpay = new WxpayProvider({
				appId: config.appId,
				mchId: config.mchId,
				privateKey: config.privateKey,
				apiV3Key: config.apiV3Key,
				certSerial: config.certSerial,
				publicKey: config.publicKey,
				publicKeyId: config.publicKeyId,
				apiBase: config.apiBase,
			});
		} else if (key === 'stripe' && config.secretKey && config.webhookSecret) {
			providers.stripe = new StripeProvider({ secretKey: config.secretKey, webhookSecret: config.webhookSecret, apiBase: config.apiBase });
		} else if ((key === 'http' || key === 'generic') && config.baseUrl) {
			providers.generic = new GenericHttpProvider(config.baseUrl, config.secret);
		}
	}
	return providers;
}
