import '../lib/load-env.mjs';
import { adminHandlers } from '../lib/admin-http.mjs';
import { jsonRoute } from '../lib/vercel-route.mjs';

export default jsonRoute(['GET'], async ({ req, query }) => adminHandlers.publicCourse(query, req));
