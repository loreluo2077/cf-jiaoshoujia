interface Env {
	DB: D1Database;
	LOCAL_AUTH_BYPASS?: string;
	TOTP_SECRET: string;
	SESSION_SECRET: string;
	NAVIGATION_TOKEN: string;
	API_TOKEN: string;
	EASYPAY_BRIDGE_PID?: string;
	EASYPAY_BRIDGE_KEY?: string;
	PUBLIC_URL?: string;
}
