import crypto from 'node:crypto';
import {
  accessSecret,
  clearSignedCookie,
  createSignedCookie,
  readSignedCookie,
  signPayload,
  verifyPasswordHash,
} from './access-auth.mjs';

const COOKIE = 'gf_admin';
const MAX_AGE_MS = 1000 * 60 * 60 * 12;

export function sessionSecret(env = process.env) {
  return accessSecret(env);
}

export function adminPassword(env = process.env) {
  return String(env.ADMIN_PASSWORD || '').trim();
}

export function adminPasswordHash(env = process.env) {
  return String(env.ADMIN_PASSWORD_HASH || '').trim();
}

export function adminEmail(env = process.env) {
  return String(env.ADMIN_EMAIL || 'admin@gradflow.local').trim();
}

export function signSession(value, secret) {
  return signPayload(value, secret);
}

export function createSessionCookie(env = process.env) {
  const { cookie, expiresAt } = createSignedCookie(COOKIE, adminEmail(env), env, MAX_AGE_MS);
  return { cookie, expiresAt };
}

export function clearSessionCookie() {
  return clearSignedCookie(COOKIE);
}

export function readSession(req, env = process.env) {
  const session = readSignedCookie(req, COOKIE, env);
  if (!session) return null;
  if (!emailsMatch(session.subject, adminEmail(env))) return null;
  return { email: adminEmail(env), expiresAt: session.expiresAt };
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

export function verifyAdminSecret(password, env = process.env) {
  const hashed = adminPasswordHash(env);
  if (hashed) return verifyPasswordHash(password, hashed);
  return passwordsMatch(password, adminPassword(env));
}

export function adminAuthConfigured(env = process.env) {
  return Boolean(adminPasswordHash(env) || adminPassword(env));
}
