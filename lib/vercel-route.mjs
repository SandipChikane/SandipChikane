import { methodNotAllowed, readJsonBody, readRawBody, sendJson } from './http.mjs';

export function jsonRoute(allowed, run) {
  return async function handler(req, res) {
    try {
      if (!allowed.includes(req.method)) {
        methodNotAllowed(res, allowed.join(', '));
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      const query = Object.fromEntries(url.searchParams.entries());
      const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readJsonBody(req);
      const result = await run({ req, query, body });
      sendJson(res, result.status, result.body);
    } catch (error) {
      const status = Number(error.status) >= 400 ? Number(error.status) : 500;
      sendJson(res, status, { error: error.message || 'Request failed' });
    }
  };
}

export function webhookRoute(run) {
  return async function handler(req, res) {
    try {
      if (req.method !== 'POST') {
        methodNotAllowed(res, 'POST');
        return;
      }
      const rawBody = await readRawBody(req);
      const signature = req.headers['x-razorpay-signature'] || '';
      const result = await run({ rawBody, signature });
      sendJson(res, result.status, result.body);
    } catch (error) {
      const status = Number(error.status) >= 400 ? Number(error.status) : 500;
      sendJson(res, status, { error: error.message || 'Webhook failed' });
    }
  };
}
