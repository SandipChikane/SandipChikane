import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './lib/load-env.mjs';
import { adminHandlers, dispatchAdmin } from './lib/admin-http.mjs';
import { createHandlers } from './lib/handlers.mjs';
import { readRawBody, sendJson, sendMedia, sendResult } from './lib/http.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const handlers = createHandlers();

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.pdf': 'application/pdf',
};

const routes = {
  'GET /api/public-config': () => handlers.publicConfig(),
  'POST /api/create-order': ({ body }) => handlers.createOrder(body),
  'POST /api/verify-payment': ({ body }) => handlers.verifyPayment(body),
  'GET /api/enrollments': ({ req }) => handlers.enrollments(req),
  'POST /api/student-login': ({ body }) => handlers.studentLogin(body),
  'POST /api/student-password': ({ req, body }) => handlers.studentPassword(req, body),
  'GET /api/student-session': ({ req }) => handlers.studentSession(req),
  'POST /api/student-logout': () => handlers.studentLogout(),
  'POST /api/tpo-session': ({ body }) => handlers.tpoSession(body),
  'POST /api/tpo-logout': () => handlers.tpoLogout(),
  'GET /api/tpo-enrollments': ({ req, query }) => handlers.tpoEnrollments(query, req),
  'POST /api/razorpay-webhook': ({ rawBody, signature }) => handlers.webhook({ rawBody, signature }),
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname === '/api/catalog') {
      sendResult(res, await adminHandlers.publicCatalog());
      return;
    }
    if (url.pathname === '/api/catalog-course') {
      sendResult(res, await adminHandlers.publicCourse(Object.fromEntries(url.searchParams.entries()), req));
      return;
    }
    if (url.pathname === '/api/lesson-media') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
      }
      await sendMedia(res, await adminHandlers.lessonMedia(req, Object.fromEntries(url.searchParams.entries())));
      return;
    }
    if (url.pathname.startsWith('/api/admin')) {
      const query = Object.fromEntries(url.searchParams.entries());
      const rawBody = req.method === 'GET' || req.method === 'HEAD' ? '' : await readRawBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      if (req.method === 'DELETE' && rawBody) Object.assign(query, body);
      const result = await dispatchAdmin({
        req,
        method: req.method,
        path: url.pathname,
        query,
        body,
      });
      sendResult(res, result);
      return;
    }
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) {
      const query = Object.fromEntries(url.searchParams.entries());
      const rawBody = req.method === 'POST' ? await readRawBody(req) : '';
      const body = rawBody ? JSON.parse(rawBody) : {};
      const result = await route({
        req,
        query,
        body,
        rawBody,
        signature: req.headers['x-razorpay-signature'] || '',
      });
      sendResult(res, result);
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    const status = Number(error.status) >= 400 ? Number(error.status) : 500;
    if (!res.headersSent) {
      sendJson(res, status, { error: error.message || 'Server error' });
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Gradflow running at http://127.0.0.1:${PORT}`);
});

async function serveStatic(pathname, res) {
  const requested = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  if (requested.includes('..') || requested.includes('\\') || requested.startsWith('/.')) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const blocked = ['.env', '.env.local', '/lib/', '/api/', '/node_modules/', '/.git/', '/supabase/'];
  if (blocked.some((part) => requested === part || requested.includes(part))) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(ROOT)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  try {
    const info = await stat(filePath);
    const finalPath = info.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    const body = await readFile(finalPath);
    res.setHeader('Content-Type', TYPES[path.extname(finalPath)] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}

