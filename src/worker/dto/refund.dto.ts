// 退款相关类型

export interface RefundRequest {
	orderId: string;
	/** 退款金额，不传则全额退款 */
	amount?: number;
	reason?: string;
	requestUrl: string;
}

export type RefundSuccess = {
	ok: true;
	status: string;
	refundAmount: string;
};

export type RefundFailure = {
	ok: false;
	error: string;
	status: number;
};

export type RefundResult = RefundSuccess | RefundFailure;
