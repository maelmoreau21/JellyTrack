const DAY_SECONDS = 24 * 60 * 60;

export const CURRENT_SESSION_MAX_AGE_SECONDS = DAY_SECONDS;
export const REMEMBERED_SESSION_MAX_AGE_SECONDS = 30 * DAY_SECONDS;

export type AuthSessionTokenLike = {
  sessionExpiresAt?: unknown;
  exp?: unknown;
};

export function parseRememberMe(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "on";
}

export function getSessionExpiresAtSeconds(token: AuthSessionTokenLike | null | undefined): number | null {
  const value = token?.sessionExpiresAt ?? token?.exp;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isSessionTokenActive(
  token: AuthSessionTokenLike | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  const expiresAt = getSessionExpiresAtSeconds(token);
  return expiresAt !== null && expiresAt > nowSeconds;
}
