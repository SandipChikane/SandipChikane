import crypto from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateReferralCode(name = '') {
  const prefix = String(name || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 6)
    .padEnd(4, randomChars(2));
  return `${prefix}${randomChars(4)}`;
}

export function isReferralCodeFormat(value) {
  return /^[A-Z2-9]{8,16}$/.test(String(value || '').trim());
}

export function normalizeReferralCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function maskEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const at = value.indexOf('@');
  if (at < 1) return '***';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const keep = local.slice(0, Math.min(2, local.length));
  return `${keep}***@${domain}`;
}

export function maskAccount(value) {
  const digits = String(value || '').replace(/\s+/g, '');
  if (digits.length < 4) return 'XXXX';
  return `XXXXXX${digits.slice(-4)}`;
}

export function firstNameOnly(name, email) {
  const fromName = String(name || '').trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = String(email || '').split('@')[0] || '';
  const word = local.split(/[._-]/)[0];
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : 'Student';
}

export function hashIdentifier(secret, value) {
  return crypto.createHmac('sha256', String(secret || 'gradflow'))
    .update(String(value || ''))
    .digest('hex');
}

export function payoutFingerprint(secret, method, details = {}) {
  if (method === 'UPI') {
    return hashIdentifier(secret, `upi:${String(details.upiId || '').trim().toLowerCase()}`);
  }
  const account = String(details.accountNumber || '').replace(/\D/g, '');
  const ifsc = String(details.ifsc || '').trim().toUpperCase();
  return hashIdentifier(secret, `bank:${account}:${ifsc}`);
}

function randomChars(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}
