import '../lib/load-env.mjs';
import { handlers } from '../lib/handlers.mjs';
import { webhookRoute } from '../lib/vercel-route.mjs';

export const config = { api: { bodyParser: false } };

export default webhookRoute(({ rawBody, signature }) => handlers.webhook({ rawBody, signature }));
