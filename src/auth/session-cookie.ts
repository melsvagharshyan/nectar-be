import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = 'nectar_session';

/**
 * The JWT lives only in this httpOnly cookie so page scripts can never read it.
 * SameSite=Lax keeps the browser from attaching it to cross-site POSTs (CSRF).
 */
const baseOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: 'lax',
  path: '/api',
});

export function setSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  secure: boolean,
) {
  res.cookie(SESSION_COOKIE, token, { ...baseOptions(secure), expires: expiresAt });
}

export function clearSessionCookie(res: Response, secure: boolean) {
  res.clearCookie(SESSION_COOKIE, baseOptions(secure));
}
