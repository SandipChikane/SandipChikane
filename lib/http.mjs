export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return req.body ? JSON.parse(req.body) : {};
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export async function readRawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function sendResult(res, result) {
  if (result?.headers) {
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
  }
  if (result?.redirect) {
    res.statusCode = result.status || 302;
    res.setHeader('Location', result.redirect);
    res.setHeader('Cache-Control', 'no-store');
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    }
    res.end();
    return;
  }
  sendJson(res, result.status, result.body);
}

export async function sendMedia(res, result) {
  if (!result?.upstream && result?.body) {
    sendResult(res, result);
    return;
  }
  res.statusCode = result.status || 200;
  for (const [key, value] of Object.entries(result.headers || {})) {
    res.setHeader(key, value);
  }
  if (!result.upstream) {
    res.end();
    return;
  }
  const stream = result.upstream;
  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      res.end();
    }
    return;
  }
  if (typeof stream.pipe === 'function') {
    stream.pipe(res);
    return;
  }
  if (typeof stream[Symbol.asyncIterator] === 'function') {
    for await (const chunk of stream) {
      res.write(chunk);
    }
  }
  res.end();
}

export function methodNotAllowed(res, allow = 'GET') {
  res.setHeader('Allow', allow);
  sendJson(res, 405, { error: 'Method not allowed' });
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function nameFromEmail(email) {
  const local = normalizeEmail(email).split('@')[0] || '';
  const words = local.split(/[._-]+/).filter(Boolean);
  if (!words.length) return 'Student';
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}
