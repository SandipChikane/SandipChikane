import { createAdminHandlers } from './admin-handlers.mjs';
import { sendResult } from './http.mjs';

export const adminHandlers = createAdminHandlers();

export async function dispatchAdmin({ req, method, path, query, body }) {
  const action = path.replace(/^\/api\/admin\/?/, '') || query.action || '';
  switch (`${method} ${action}`) {
    case 'GET session':
      return adminHandlers.session(req);
    case 'POST login':
      return adminHandlers.login(req, body);
    case 'POST course-status':
      return adminHandlers.setCourseStatus(req, body);
    case 'GET export':
      return adminHandlers.exportCourses(req);
    case 'POST import':
      return adminHandlers.importCourses(req, body);
    case 'POST logout':
      return adminHandlers.logout();
    case 'GET overview':
      return adminHandlers.overview(req);
    case 'GET courses':
      return adminHandlers.listCourses(req);
    case 'POST courses':
      return adminHandlers.saveCourse(req, body);
    case 'GET course':
      return adminHandlers.getCourse(req, query);
    case 'PUT course':
    case 'POST course':
      return adminHandlers.saveCourse(req, body);
    case 'DELETE course':
      return adminHandlers.deleteCourse(req, query);
    case 'POST duplicate':
      return adminHandlers.duplicateCourse(req, body);
    case 'POST seed':
      return adminHandlers.seed(req);
    case 'GET media':
      return adminHandlers.listMedia(req, query);
    case 'POST media':
      return adminHandlers.saveMedia(req, body);
    case 'DELETE media':
      return adminHandlers.deleteMedia(req, query);
    case 'POST upload-sign':
      return adminHandlers.signUpload(req, body);
    case 'GET enrollments':
      return adminHandlers.listEnrollments(req);
    case 'POST enrollments':
      return adminHandlers.grantEnrollment(req, body);
    case 'DELETE enrollments':
      return adminHandlers.revokeEnrollment(req, body);
    case 'GET students':
      return adminHandlers.students(req);
    case 'GET colleges':
      return adminHandlers.colleges(req);
    case 'GET settings':
      return adminHandlers.settings(req, body, 'GET');
    case 'POST settings':
      return adminHandlers.settings(req, body, 'POST');
    case 'GET audit':
      return adminHandlers.audit(req);
    default:
      return { status: 404, body: { error: 'Admin route not found.' } };
  }
}

export function adminVercelHandler() {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const query = Object.fromEntries(url.searchParams.entries());
      const chunks = [];
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE') {
        if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
          const result = await dispatchAdmin({
            req,
            method: req.method,
            path: url.pathname,
            query,
            body: req.body,
          });
          sendResult(res, result);
          return;
        }
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        for await (const chunk of req) chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === 'DELETE' && raw) Object.assign(query, body);
      const result = await dispatchAdmin({
        req,
        method: req.method,
        path: url.pathname,
        query,
        body,
      });
      sendResult(res, result);
    } catch (error) {
      const status = Number(error.status) >= 400 ? Number(error.status) : 500;
      sendResult(res, { status, body: { error: error.message || 'Admin request failed' } });
    }
  };
}
