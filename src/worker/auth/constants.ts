export const SESSION_COOKIE = 'jiaoshoujia_session';
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const SESSION_SUBJECT = 'owner';

export function hasAuthSecret(env: Env): boolean {
	return Boolean(env.TOTP_SECRET && env.SESSION_SECRET && env.NAVIGATION_TOKEN && env.API_TOKEN);
}
