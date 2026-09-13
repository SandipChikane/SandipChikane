export function createRateLimiter({ windowMs = 60_000, max = 20 } = {}) {
  const hits = new Map();
  return function allow(key) {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((stamp) => now - stamp < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

export function clientKey(req, extra = '') {
  const ip = String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'local')
    .split(',')[0]
    .trim();
  return extra ? `${extra}:${ip}` : ip;
}
