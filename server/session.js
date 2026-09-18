import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'sabo_admin';
export const SESSION_SECONDS = 8 * 60 * 60;

function signature(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createSessionCookie(secret, now = new Date()) {
  const payload = Buffer.from(JSON.stringify({ admin: true, exp: Math.floor(now.getTime() / 1000) + SESSION_SECONDS })).toString('base64url');
  const token = `${payload}.${signature(payload, secret)}`;
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function readSession(cookieHeader, secret, now = new Date()) {
  const raw = String(cookieHeader || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE_NAME}=`));
  if (!raw) return false;
  const token = raw.slice(COOKIE_NAME.length + 1);
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const supplied = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = Buffer.from(signature(payload, secret), 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.admin === true && Number.isInteger(data.exp) && data.exp > Math.floor(now.getTime() / 1000);
  } catch {
    return false;
  }
}
