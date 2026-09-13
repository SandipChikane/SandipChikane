import { hashPassword, readSignedCookie, validateStudentPassword } from './access-auth.mjs';
import { courseById } from './catalog.mjs';
import {
  adminAuthConfigured,
  adminEmail,
  clearSessionCookie,
  createSessionCookie,
  emailsMatch,
  readSession,
  sessionSecret,
  verifyAdminSecret,
} from './admin-auth.mjs';
import { createCms, toAdminCourse, toPublicCourse, toStudentCourse } from './cms.mjs';
import { readEnv, supabaseReady } from './env.mjs';
import { isValidEmail, nameFromEmail, normalizeEmail } from './http.mjs';
import { createStorage, kindFromMime, safeObjectName } from './storage.mjs';
import { STUDENT_COOKIE, serveLessonMedia } from './student-media.mjs';
import { createSupabaseClient } from './supabase.mjs';

function unauthorized() {
  return { status: 401, body: { error: 'Admin sign-in required.' } };
}

function forbidden(message) {
  return { status: 403, body: { error: message } };
}

const loginAttempts = new Map();

function recentLogins(key) {
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter((stamp) => now - stamp < 10 * 60 * 1000);
  loginAttempts.set(key, recent);
  return recent;
}

function tooManyLogins(key) {
  return recentLogins(key).length >= 8;
}

function recordFailedLogin(key) {
  recentLogins(key).push(Date.now());
}

export function createAdminHandlers(deps = {}) {
  const envSource = deps.env || process.env;
  const fetchImpl = deps.fetch || globalThis.fetch;

  function context() {
    const env = readEnv(envSource);
    const supabase = env.supabaseUrl && env.supabaseServiceRoleKey
      ? createSupabaseClient({
        url: env.supabaseUrl,
        serviceRoleKey: env.supabaseServiceRoleKey,
        fetchImpl,
      })
      : null;
    return {
      env,
      ready: supabaseReady(env),
      supabase,
      cms: supabase ? createCms({ supabaseRequest: supabase.request.bind(supabase) }) : null,
      storage: supabase
        ? createStorage({
          url: env.supabaseUrl,
          serviceRoleKey: env.supabaseServiceRoleKey,
          fetchImpl,
        })
        : null,
    };
  }

  function requireAdmin(req) {
    return readSession(req, envSource);
  }

  async function requireReadyAdmin(req) {
    const session = requireAdmin(req);
    if (!session) return { error: unauthorized() };
    const ctx = context();
    if (!ctx.ready) {
      return { error: { status: 503, body: { error: 'Supabase is not configured.' } } };
    }
    return { session, ...ctx };
  }

  return {
    async session(req) {
      const session = requireAdmin(req);
      if (!session) return unauthorized();
      return {
        status: 200,
        body: { ok: true, email: session.email, expiresAt: session.expiresAt },
      };
    },

    async login(req, body = {}) {
      if (!adminAuthConfigured(envSource)) {
        return { status: 503, body: { error: 'Admin credentials are not configured.' } };
      }
      if (!sessionSecret(envSource)) {
        return { status: 503, body: { error: 'ADMIN_SESSION_SECRET is not set.' } };
      }
      const ip = String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || 'local').split(',')[0].trim();
      if (tooManyLogins(ip)) {
        return { status: 429, body: { error: 'Too many sign-in attempts. Try again in a few minutes.' } };
      }
      const emailOk = emailsMatch(body.email, adminEmail(envSource));
      const passwordOk = verifyAdminSecret(body.password, envSource);
      if (!emailOk || !passwordOk) {
        recordFailedLogin(ip);
        return { status: 401, body: { error: 'Wrong admin email or password.' } };
      }
      const { cookie, expiresAt } = createSessionCookie(envSource);
      return {
        status: 200,
        headers: { 'Set-Cookie': cookie },
        body: { ok: true, email: adminEmail(envSource), expiresAt },
      };
    },

    logout() {
      return {
        status: 200,
        headers: { 'Set-Cookie': clearSessionCookie() },
        body: { ok: true },
      };
    },

    async overview(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const [courses, enrollments, media, audit] = await Promise.all([
        gate.cms.listCourses(),
        gate.cms.listAdminEnrollments(),
        gate.cms.listMedia(),
        gate.cms.listAudit(),
      ]);
      const paid = (enrollments || []).filter((row) => row.paid);
      const courseMap = new Map((courses || []).map((course) => [course.id, course]));
      const revenue = paid.reduce((sum, row) => sum + Number(courseMap.get(row.course_id)?.price || 0), 0);
      const students = new Set(paid.map((row) => row.student_email)).size;
      const colleges = new Set(paid.map((row) => row.college).filter(Boolean)).size;
      return {
        status: 200,
        body: {
          courses: (courses || []).length,
          published: (courses || []).filter((course) => course.status === 'published').length,
          drafts: (courses || []).filter((course) => course.status === 'draft').length,
          enrollments: paid.length,
          students,
          colleges,
          revenue,
          media: (media || []).length,
          videos: (media || []).filter((item) => item.kind === 'video').length,
          images: (media || []).filter((item) => item.kind === 'image').length,
          recentEnrollments: paid.slice(0, 6).map(adminEnrollment),
          recentAudit: (audit || []).slice(0, 8),
        },
      };
    },

    async listCourses(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const rows = await gate.cms.listCourses();
      return {
        status: 200,
        body: { courses: (rows || []).map((row) => toAdminCourse(row, [], [])) },
      };
    },

    async getCourse(req, query = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const hydrated = await gate.cms.getHydrated(query.id);
      if (!hydrated) return { status: 404, body: { error: 'Course not found.' } };
      return {
        status: 200,
        body: { course: toAdminCourse(hydrated.row, hydrated.modules, hydrated.lessons) },
      };
    },

    async saveCourse(req, body = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const hydrated = await gate.cms.saveCourse(body);
      await gate.cms.writeAudit('save-course', 'course', hydrated.row.id, { name: hydrated.row.name, status: hydrated.row.status });
      return {
        status: 200,
        body: { course: toAdminCourse(hydrated.row, hydrated.modules, hydrated.lessons) },
      };
    },

    async deleteCourse(req, query = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      if (!query.id) return { status: 400, body: { error: 'Course id is required.' } };
      await gate.cms.deleteCourse(query.id);
      await gate.cms.writeAudit('delete-course', 'course', query.id, {});
      return { status: 200, body: { ok: true } };
    },

    async duplicateCourse(req, body = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const hydrated = await gate.cms.getHydrated(body.id);
      if (!hydrated) return { status: 404, body: { error: 'Course not found.' } };
      const course = toAdminCourse(hydrated.row, hydrated.modules, hydrated.lessons);
      let nextId = `${course.id}-copy`;
      if (await gate.cms.getHydrated(nextId)) {
        nextId = `${course.id}-copy-${Date.now().toString(36)}`;
      }
      const copy = {
        ...course,
        id: nextId,
        name: `${course.name} (copy)`,
        status: 'draft',
        featured: false,
      };
      const saved = await gate.cms.saveCourse(copy);
      await gate.cms.writeAudit('duplicate-course', 'course', saved.row.id, { from: course.id });
      return {
        status: 200,
        body: { course: toAdminCourse(saved.row, saved.modules, saved.lessons) },
      };
    },

    async setCourseStatus(req, body = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const hydrated = await gate.cms.setCourseStatus(body.id, body.status);
      if (!hydrated) return { status: 404, body: { error: 'Course not found.' } };
      await gate.cms.writeAudit('set-status', 'course', hydrated.row.id, { status: hydrated.row.status });
      return {
        status: 200,
        body: { course: toAdminCourse(hydrated.row, hydrated.modules, hydrated.lessons) },
      };
    },

    async exportCourses(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const rows = await gate.cms.listCourses();
      const courses = [];
      for (const row of rows || []) {
        const hydrated = await gate.cms.getHydrated(row.id);
        courses.push(toAdminCourse(hydrated.row, hydrated.modules, hydrated.lessons));
      }
      return { status: 200, body: { courses } };
    },

    async importCourses(req, body = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const list = Array.isArray(body.courses) ? body.courses : [];
      if (!list.length) return { status: 400, body: { error: 'No courses to import.' } };
      const imported = [];
      for (const course of list) {
        const saved = await gate.cms.saveCourse(course);
        imported.push(saved.row.id);
      }
      await gate.cms.writeAudit('import-courses', 'courses', null, { imported });
      return { status: 200, body: { imported: imported.length, ids: imported } };
    },

    async seed(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const result = await gate.cms.seedBuiltIn();
      await gate.storage.ensureBucket();
      await gate.cms.writeAudit('seed-catalog', 'courses', null, result);
      return { status: 200, body: result };
    },

    async listMedia(req, query = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const rows = await gate.cms.listMedia(query.kind);
      return { status: 200, body: { media: rows || [] } };
    },

    async signUpload(req, body = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      await gate.storage.ensureBucket();
      const kind = kindFromMime(body.contentType, body.filename);
      const folder = body.courseId ? `courses/${body.courseId}/${kind}s` : `${kind}s`;
      const path = safeObjectName(body.filename, folder);
      const signed = await gate.storage.createSignedUpload(path);
      return {
        status: 200,
        body: { ...signed, kind, bucket: gate.storage.bucket },
      };
    },

    async saveMedia(req, body = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const rows = await gate.cms.saveMedia({
        bucket: body.bucket || gate.storage.bucket,
        path: body.path,
        public_url: body.publicUrl,
        kind: body.kind,
        title: body.title || body.filename || body.path,
        course_id: body.courseId || null,
        mime_type: body.mimeType || null,
        size_bytes: Number(body.sizeBytes) || null,
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      await gate.cms.writeAudit('upload-media', 'media', row?.id, { kind: body.kind, path: body.path });
      return { status: 200, body: { media: row } };
    },

    async deleteMedia(req, query = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const row = await gate.cms.deleteMedia(query.id);
      if (row?.path) {
        try { await gate.storage.remove(row.path); } catch { /* keep the row deleted even if storage cleanup fails */ }
      }
      await gate.cms.writeAudit('delete-media', 'media', query.id, { path: row?.path });
      return { status: 200, body: { ok: true } };
    },

    async listEnrollments(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const rows = await gate.cms.listAdminEnrollments();
      return { status: 200, body: { enrollments: (rows || []).map(adminEnrollment) } };
    },

    async grantEnrollment(req, body = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const email = normalizeEmail(body.email);
      const courseId = String(body.courseId || '').trim();
      if (!isValidEmail(email) || !courseId) {
        return { status: 400, body: { error: 'Email and course are required.' } };
      }
      const hydrated = await gate.cms.getHydrated(courseId);
      const fallback = courseById(courseId);
      const courseName = hydrated?.row?.name || fallback?.name || courseId;
      const studentName = String(body.studentName || nameFromEmail(email)).trim();
      const college = String(body.college || '').trim();
      const password = String(body.password || '');
      if (password) {
        const passwordError = validateStudentPassword(password);
        if (passwordError) {
          return { status: 400, body: { error: passwordError } };
        }
        await gate.supabase.upsertStudentAccount({
          email,
          password_hash: hashPassword(password),
          name: studentName,
          college,
        });
      }
      await gate.supabase.upsertEnrollment({
        student_email: email,
        student_name: studentName,
        college,
        course_id: courseId,
        course_name: courseName,
        paid: true,
      });
      await gate.cms.writeAudit('grant-enrollment', 'enrollment', email, {
        courseId,
        accountCreated: Boolean(password),
      });
      return { status: 200, body: { ok: true, hasAccount: Boolean(password) } };
    },

    async revokeEnrollment(req, body = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const email = normalizeEmail(body.email);
      const courseId = String(body.courseId || '').trim();
      await gate.supabase.request(
        `enrollments?student_email=eq.${encodeURIComponent(email)}&course_id=eq.${encodeURIComponent(courseId)}`,
        { method: 'DELETE' },
      );
      await gate.cms.writeAudit('revoke-enrollment', 'enrollment', email, { courseId });
      return { status: 200, body: { ok: true } };
    },

    async students(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const rows = (await gate.cms.listAdminEnrollments()) || [];
      let accountEmails = new Set();
      try {
        accountEmails = new Set(await gate.supabase.listStudentAccountEmails());
      } catch {
        accountEmails = new Set();
      }
      const map = new Map();
      for (const row of rows) {
        const key = row.student_email;
        const current = map.get(key) || {
          email: key,
          name: row.student_name || nameFromEmail(key),
          college: row.college || '',
          hasAccount: accountEmails.has(key),
          courses: [],
          enrolledAt: row.enrolled_at,
        };
        current.courses.push({
          courseId: row.course_id,
          courseName: row.course_name,
          paid: Boolean(row.paid),
        });
        map.set(key, current);
      }
      return { status: 200, body: { students: [...map.values()] } };
    },

    async colleges(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const rows = (await gate.cms.listAdminEnrollments()) || [];
      const map = new Map();
      for (const row of rows) {
        const key = row.college || 'Unspecified';
        const current = map.get(key) || { college: key, students: new Set(), enrollments: 0 };
        current.enrollments += 1;
        current.students.add(row.student_email);
        map.set(key, current);
      }
      return {
        status: 200,
        body: {
          colleges: [...map.values()].map((item) => ({
            college: item.college,
            students: item.students.size,
            enrollments: item.enrollments,
          })),
        },
      };
    },

    async settings(req, body, method) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      if (method === 'POST') {
        const saved = await gate.cms.saveSettings(body || {});
        await gate.cms.writeAudit('save-settings', 'settings', null, { keys: Object.keys(body || {}) });
        return { status: 200, body: { settings: saved } };
      }
      return { status: 200, body: { settings: await gate.cms.getSettings() } };
    },

    async audit(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      return { status: 200, body: { audit: await gate.cms.listAudit() } };
    },

    async publicCatalog() {
      const ctx = context();
      if (!ctx.ready) {
        return { status: 200, body: { courses: [], source: 'none' } };
      }
      try {
        const rows = await ctx.cms.listPublished();
        const courses = [];
        for (const row of rows || []) {
          const hydrated = await ctx.cms.getHydrated(row.id);
          courses.push(toPublicCourse(hydrated.row, hydrated.modules, hydrated.lessons));
        }
        return { status: 200, body: { courses, source: 'cms' } };
      } catch {
        return { status: 200, body: { courses: [], source: 'fallback' } };
      }
    },

    async publicCourse(query = {}, req) {
      const ctx = context();
      if (!ctx.ready || !query.id) return { status: 404, body: { error: 'Course not found.' } };
      try {
        const hydrated = await ctx.cms.getHydrated(query.id);
        const canPreview = query.preview === '1' && Boolean(readSession(req, envSource));
        if (!hydrated || (hydrated.row.status !== 'published' && !canPreview)) {
          return { status: 404, body: { error: 'Course not found.' } };
        }
        const email = normalizeEmail(readSignedCookie(req, STUDENT_COOKIE, envSource)?.subject);
        const enrollment = email && ctx.supabase
          ? await ctx.supabase.getEnrollment(email, query.id)
          : null;
        const unlocked = canPreview || Boolean(enrollment?.paid);
        return {
          status: 200,
          body: {
            course: unlocked
              ? toStudentCourse(hydrated.row, hydrated.modules, hydrated.lessons)
              : toPublicCourse(hydrated.row, hydrated.modules, hydrated.lessons),
            preview: canPreview && hydrated.row.status !== 'published',
          },
        };
      } catch {
        return { status: 404, body: { error: 'Course not found.' } };
      }
    },

    async lessonMedia(req, query = {}) {
      const ctx = context();
      if (!ctx.ready || !ctx.cms) {
        return { status: 503, body: { error: 'Course media is not configured yet.' } };
      }
      try {
        const accessCourseId = String(query.course || '').trim();
        const hydrated = accessCourseId ? await ctx.cms.getHydrated(accessCourseId) : null;
        const course = hydrated
          ? toAdminCourse(hydrated.row, hydrated.modules, hydrated.lessons)
          : null;
        return serveLessonMedia({
          req,
          query,
          env: envSource,
          course,
          status: hydrated?.row?.status,
          supabase: ctx.supabase,
          fetchImpl,
        });
      } catch {
        return { status: 404, body: { error: 'Lesson media was not found.' } };
      }
    },

    async resolvePayableCourse(courseId) {
      const ctx = context();
      if (ctx.ready) {
        try {
          const hydrated = await ctx.cms.getHydrated(courseId);
          if (hydrated?.row?.status === 'published') {
            return {
              id: hydrated.row.id,
              name: hydrated.row.name,
              price: Number(hydrated.row.price) || 0,
            };
          }
        } catch { /* published CMS courses only */ }
      }
      return null;
    },
  };
}

export const adminHandlers = createAdminHandlers();

export function adminEnrollment(row) {
  return {
    id: row.id,
    studentEmail: row.student_email,
    studentName: row.student_name || '',
    college: row.college || '',
    courseId: row.course_id,
    courseName: row.course_name,
    paid: Boolean(row.paid),
    razorpayOrderId: row.razorpay_order_id || '',
    razorpayPaymentId: row.razorpay_payment_id || '',
    enrolledAt: row.enrolled_at,
  };
}

export function applyResultHeaders(res, result) {
  if (!result?.headers) return;
  for (const [key, value] of Object.entries(result.headers)) {
    res.setHeader(key, value);
  }
}
