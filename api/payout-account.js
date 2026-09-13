import '../lib/load-env.mjs';
import { handlers } from '../lib/handlers.mjs';
import { jsonRoute } from '../lib/vercel-route.mjs';

export default jsonRoute(['GET', 'POST'], async ({ req, body }) => (
  handlers.referralPayout(req, body, req.method)
));
