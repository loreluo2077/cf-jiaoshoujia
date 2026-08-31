export const SESSION_COOKIE = 'jiaoshoujia_session';
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const SESSION_SUBJECT = 'owner';

export function hasTotpConfig(env: Env): boolean {
	return Boolean(env.TOTP_SECRET && env.SESSION_SECRET);
}

export function hasNavigationConfig(env: Env): boolean {
	return Boolean(env.NAVIGATION_TOKEN && env.SESSION_SECRET);
}

export function hasApiConfig(env: Env): boolean {
	return Boolean(env.API_TOKEN);
}

export function hasAuthSecret(env: Env): boolean {
	return hasTotpConfig(env) && hasNavigationConfig(env) && hasApiConfig(env);
}
