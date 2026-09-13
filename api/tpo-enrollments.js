import '../lib/load-env.mjs';
import { handlers } from '../lib/handlers.mjs';
import { jsonRoute } from '../lib/vercel-route.mjs';

export default jsonRoute(['GET'], async ({ query }) => handlers.tpoEnrollments(query));
