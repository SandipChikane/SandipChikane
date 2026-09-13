import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

export function payoutKey(env = process.env) {
  const explicit = String(env.REFERRAL_PAYOUT_KEY || '').trim();
  if (explicit) {
    return crypto.createHash('sha256').update(explicit).digest();
  }
  const fallback = String(env.ADMIN_SESSION_SECRET || '').trim();
  if (!fallback) return null;
  return crypto.createHash('sha256').update(`${fallback}:payout`).digest();
}

export function encryptPayoutDetails(details, env = process.env) {
  const key = payoutKey(env);
  if (!key) {
    const error = new Error('Payout encryption key is not configured.');
    error.status = 503;
    throw error;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const payload = Buffer.concat([
    cipher.update(JSON.stringify(details || {}), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${payload.toString('base64url')}`;
}

export function decryptPayoutDetails(encoded, env = process.env) {
  const key = payoutKey(env);
  if (!key || !encoded) return null;
  const [version, ivB64, tagB64, dataB64] = String(encoded).split('.');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const json = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function maskPayoutDetails(details = {}, method = '') {
  if (method === 'UPI') {
    return { method, upiId: maskTail(details.upiId), holderName: details.holderName || '' };
  }
  return {
    method,
    holderName: details.holderName || '',
    bankName: details.bankName || '',
    ifsc: details.ifsc || '',
    accountNumber: maskTail(details.accountNumber),
  };
}

function maskTail(value) {
  const text = String(value || '');
  if (text.length < 4) return 'XXXX';
  return `XXXXXX${text.slice(-4)}`;
}
