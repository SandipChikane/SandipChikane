import '../lib/load-env.mjs';
import { adminHandlers } from '../lib/admin-http.mjs';
import { sendJson, sendMedia } from '../lib/http.mjs';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    const query = Object.fromEntries(url.searchParams.entries());
    await sendMedia(res, await adminHandlers.lessonMedia(req, query));
  } catch (error) {
    const status = Number(error.status) >= 400 ? Number(error.status) : 500;
    sendJson(res, status, { error: error.message || 'Lesson media could not be opened.' });
  }
}
