import '../lib/load-env.mjs';
import { handlers } from '../lib/handlers.mjs';
import { sendResult } from '../lib/http.mjs';

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const result = await handlers.visitReferral(req, {
      code: url.searchParams.get('code') || '',
      next: url.searchParams.get('next') || '',
    });
    sendResult(res, result);
  } catch (error) {
    const status = Number(error.status) >= 400 ? Number(error.status) : 500;
    sendResult(res, { status, body: { error: 'Referral link could not be opened.' } });
  }
}
