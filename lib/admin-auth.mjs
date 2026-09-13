import crypto from 'node:crypto';

const COOKIE = 'gf_admin';
const MAX_AGE_MS = 1000 * 60 * 60 * 12;

export function readCookies(header = '') {
  return Object.fromEntries(
    String(header || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

export function sessionSecret(env = process.env) {
  return String(env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || 'gradflow-dev-secret').trim();
}

export function adminPassword(env = process.env) {
  return String(env.ADMIN_PASSWORD || '').trim();
}

export function adminEmail(env = process.env) {
  return String(env.ADMIN_EMAIL || 'admin@gradflow.local').trim();
}

export function signSession(expiresAt, secret) {
  return crypto.createHmac('sha256', secret).update(String(expiresAt)).digest('hex');
}

export function createSessionCookie(env = process.env) {
  const expiresAt = Date.now() + MAX_AGE_MS;
  const value = `${expiresAt}.${signSession(expiresAt, sessionSecret(env))}`;
  const secure = env.VERCEL || env.ADMIN_COOKIE_SECURE === '1' ? '; Secure' : '';
  return {
    cookie: `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(MAX_AGE_MS / 1000)}${secure}`,
    expiresAt,
  };
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readSession(req, env = process.env) {
  const cookies = readCookies(req.headers?.cookie);
  const raw = cookies[COOKIE];
  if (!raw) return null;
  const [expiresAt, signature] = raw.split('.');
  if (!expiresAt || !signature) return null;
  if (Number(expiresAt) < Date.now()) return null;
  const expected = signSession(expiresAt, sessionSecret(env));
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  return { email: adminEmail(env), expiresAt: Number(expiresAt) };
}

export function passwordsMatch(input, expected) {
  const left = Buffer.from(String(input || ''));
  const right = Buffer.from(String(expected || ''));
  if (!expected || left.length !== right.length) {
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function emailsMatch(input, expected) {
  return passwordsMatch(String(input || '').trim().toLowerCase(), String(expected || '').trim().toLowerCase());
}
