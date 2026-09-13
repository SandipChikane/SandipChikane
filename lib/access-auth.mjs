import crypto from 'node:crypto';

export function encodeSubject(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64url');
}

export function decodeSubject(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

export function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(String(payload)).digest('hex');
}

export function cookieSecureFlag(env = process.env) {
  return env.VERCEL || env.ADMIN_COOKIE_SECURE === '1' ? '; Secure' : '';
}

export function accessSecret(env = process.env) {
  return String(env.ADMIN_SESSION_SECRET || '').trim();
}

export function createSignedCookie(name, subject, env = process.env, maxAgeMs = 1000 * 60 * 60 * 12) {
  const secret = accessSecret(env);
  if (!secret) {
    const error = new Error('ADMIN_SESSION_SECRET is not set.');
    error.status = 503;
    throw error;
  }
  const expiresAt = Date.now() + maxAgeMs;
  const payload = `${encodeSubject(subject)}.${expiresAt}`;
  const value = `${payload}.${signPayload(payload, secret)}`;
  return {
    cookie: `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${cookieSecureFlag(env)}`,
    expiresAt,
    subject,
  };
}

export function readSignedCookie(req, name, env = process.env) {
  const secret = accessSecret(env);
  if (!secret) return null;
  const raw = readCookieValue(req?.headers?.cookie, name);
  if (!raw) return null;
  const [encoded, expiresAt, signature] = raw.split('.');
  if (!encoded || !expiresAt || !signature) return null;
  if (Number(expiresAt) < Date.now()) return null;
  const payload = `${encoded}.${expiresAt}`;
  const expected = signPayload(payload, secret);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  const subject = decodeSubject(encoded);
  if (!subject) return null;
  return { subject, expiresAt: Number(expiresAt) };
}

export function clearSignedCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password || ''), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export function verifyPasswordHash(password, encoded) {
  const parts = String(encoded || '').split('$');
  if (parts[0] !== 'scrypt' || parts.length !== 6) return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  if (!salt.length || !expected.length) return false;
  const actual = crypto.scryptSync(String(password || ''), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function readCookieValue(header, name) {
  const cookies = String(header || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of cookies) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index) === name) {
      return decodeURIComponent(part.slice(index + 1));
    }
  }
  return '';
}
