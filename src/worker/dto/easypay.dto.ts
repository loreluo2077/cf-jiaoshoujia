// EasyPay 相关类型

export type BridgeConfig = {
	id?: string;
	pid: string;
	key: string;
};

export type EasyPayParams = Record<string, string>;
