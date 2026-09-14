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
import { computeProgress, continueLabel, continueTarget } from './hierarchy.mjs';
import { createCms, fromHydrated } from './cms.mjs';
import { parseLanding } from './landing.mjs';
import { readEnv, supabaseReady } from './env.mjs';
import { isValidEmail, nameFromEmail, normalizeEmail } from './http.mjs';
import { createStorage, kindFromMime, safeObjectName } from './storage.mjs';
import { STUDENT_COOKIE, serveLessonMedia } from './student-media.mjs';
import { csrfOk } from './csrf.mjs';
import { buildReferralStack } from './referral-handlers.mjs';
import { defaultProductReferralSettings, flattenReferralSettings, normalizeReferralSettingsForm, parseProductReferralSettings } from './referral-settings.mjs';
import { createSupabaseClient } from './supabase.mjs';
import { createWithdrawalServices } from './withdrawals.mjs';

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

  function referralStack(ctx) {
    if (deps.referralStack) return deps.referralStack;
    if (!ctx?.supabase && !deps.store) return null;
    return buildReferralStack({ env: envSource, supabase: ctx.supabase, store: deps.store });
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
          withdrawalNotices: await loadWithdrawalNotices(referralStack(gate)),
        },
      };
    },

    async listCourses(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const rows = await gate.cms.listCourses();
      return {
        status: 200,
        body: { courses: (rows || []).map((row) => fromHydrated({ row, modules: [], lessons: [], sections: [] })) },
      };
    },

    async getCourse(req, query = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const hydrated = await gate.cms.getHydrated(query.id);
      if (!hydrated) return { status: 404, body: { error: 'Course not found.' } };
      const course = fromHydrated(hydrated);
      const stack = referralStack(gate);
      try {
        course.referral = stack ? await stack.referral.productSettings(course.id) : defaultProductReferralSettings();
      } catch {
        course.referral = defaultProductReferralSettings();
      }
      return {
        status: 200,
        body: { course },
      };
    },

    async saveCourse(req, body = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const previous = await gate.cms.getHydrated(body.id);
      const hydrated = await gate.cms.saveCourse(body);
      const auditDetail = { name: hydrated.row.name, status: hydrated.row.status };
      if (previous?.row && Number(previous.row.price) !== Number(hydrated.row.price)) {
        await gate.cms.writeAudit('price-change', 'course', hydrated.row.id, {
          old: previous.row.price,
          new: hydrated.row.price,
        });
      }
      const stack = referralStack(gate);
      if (stack && body.referral) {
        const before = await stack.referral.productSettings(hydrated.row.id);
        const saved = await stack.referral.saveProductSettings(
          hydrated.row.id,
          parseProductReferralSettings(body.referral),
        );
        await gate.cms.writeAudit('referral-product-settings', 'course', hydrated.row.id, {
          old: before,
          new: saved,
        });
        auditDetail.referral = true;
      }
      await gate.cms.writeAudit('save-course', 'course', hydrated.row.id, auditDetail);
      const course = fromHydrated(hydrated);
      try {
        course.referral = stack ? await stack.referral.productSettings(course.id) : defaultProductReferralSettings();
      } catch {
        course.referral = defaultProductReferralSettings();
      }
      return {
        status: 200,
        body: { course },
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
      const course = fromHydrated(hydrated);
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
        sections: (course.sections || []).map((section) => ({
          ...section,
          id: undefined,
          modules: (section.modules || []).map((module) => ({
            ...module,
            id: undefined,
            sectionId: undefined,
            lessons: (module.lessons || []).map((lesson) => ({
              ...lesson,
              id: undefined,
              moduleId: undefined,
            })),
          })),
        })),
      };
      const saved = await gate.cms.saveCourse(copy);
      await gate.cms.writeAudit('duplicate-course', 'course', saved.row.id, { from: course.id });
      return {
        status: 200,
        body: { course: fromHydrated(saved) },
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
        body: { course: fromHydrated(hydrated) },
      };
    },

    async exportCourses(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const rows = await gate.cms.listCourses();
      const courses = [];
      for (const row of rows || []) {
        const hydrated = await gate.cms.getHydrated(row.id);
        courses.push(fromHydrated(hydrated));
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
      const stack = referralStack(gate);
      if (method === 'POST') {
        const site = {
          supportEmail: body.supportEmail,
          checkoutName: body.checkoutName,
          announcement: body.announcement,
        };
        const saved = await gate.cms.saveSettings(site);
        let referral = null;
        if (stack) {
          const current = await stack.referral.globalSettings();
          referral = await stack.referral.saveGlobalSettings(
            normalizeReferralSettingsForm({ ...flattenReferralSettings(current), ...body }),
          );
          await gate.cms.writeAudit('referral-settings', 'settings', 'referral', {
            old: flattenReferralSettings(current),
            new: flattenReferralSettings(referral),
          });
        }
        await gate.cms.writeAudit('save-settings', 'settings', null, { keys: Object.keys(site) });
        return {
          status: 200,
          body: { settings: { ...saved, ...(referral ? flattenReferralSettings(referral) : {}) } },
        };
      }
      const settings = await gate.cms.getSettings();
      let referral = {};
      try {
        referral = stack ? flattenReferralSettings(await stack.referral.globalSettings()) : {};
      } catch {
        referral = flattenReferralSettings({});
      }
      return { status: 200, body: { settings: { ...settings, ...referral } } };
    },

    async landing(req, body = {}, method = 'GET') {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      if (method === 'POST') {
        const landing = parseLanding(body);
        await gate.cms.saveSettings({
          landing,
          announcement: landing.announcement,
        });
        await gate.cms.writeAudit('save-landing', 'settings', 'landing', { keys: Object.keys(landing) });
        return { status: 200, body: { landing } };
      }
      const settings = await gate.cms.getSettings();
      const landing = parseLanding(settings.landing);
      if (settings.announcement) landing.announcement = String(settings.announcement);
      return { status: 200, body: { landing } };
    },

    async referralOverview(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const stack = referralStack(gate);
      if (!stack) return { status: 503, body: { error: 'Referral store is not ready.' } };
      return { status: 200, body: await stack.referral.adminOverview() };
    },

    async reverseCommission(req, body = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      if (!csrfOk(req)) return { status: 403, body: { error: 'This request could not be verified.' } };
      const stack = referralStack(gate);
      const commission = await stack.referral.getCommission(body.id);
      if (!commission) return { status: 404, body: { error: 'Commission not found.' } };
      const result = await stack.referral.reverseCommission(commission, { reason: 'admin' });
      await gate.cms.writeAudit('commission-reversal', 'commission', commission.id, { reason: 'admin' });
      return { status: 200, body: result };
    },

    async updateWithdrawal(req, body = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      if (!csrfOk(req)) return { status: 403, body: { error: 'This request could not be verified.' } };
      if (body.status === 'PAID' && !String(body.providerReference || body.utr || '').trim()) {
        return { status: 400, body: { error: 'Enter the UTR / transaction reference before marking paid.' } };
      }
      const stack = referralStack(gate);
      const withdrawals = createWithdrawalServices({ store: stack.store, env: envSource });
      const updated = await withdrawals.setWithdrawalStatus(
        body.id,
        body.status,
        body.adminNote || '',
        body.providerReference || body.utr || '',
      );
      await gate.cms.writeAudit('withdrawal-status', 'withdrawal', body.id, {
        status: body.status,
        hasReference: Boolean(body.providerReference || body.utr),
      });
      return { status: 200, body: { withdrawal: updated } };
    },

    async withdrawalDetail(req, query = {}) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const stack = referralStack(gate);
      const id = String(query.id || '').trim();
      const withdrawal = await stack.referral.getWithdrawal(id);
      if (!withdrawal) return { status: 404, body: { error: 'Withdrawal not found.' } };
      const payoutRow = await stack.store.getPayoutAccount(withdrawal.userEmail);
      const { decryptPayoutDetails } = await import('./payout-crypto.mjs');
      const details = payoutRow ? decryptPayoutDetails(payoutRow.encryptedPayload, envSource) || {} : {};
      if (query.noticeId && stack.store.markNoticeRead) {
        await stack.store.markNoticeRead(query.noticeId);
      }
      return {
        status: 200,
        body: {
          withdrawal: {
            id: withdrawal.id,
            userEmail: withdrawal.userEmail,
            amountPaise: withdrawal.amountPaise,
            method: withdrawal.method,
            status: withdrawal.status,
            createdAt: withdrawal.createdAt,
            paidAt: withdrawal.paidAt,
            providerReference: withdrawal.providerReference || '',
            adminNote: withdrawal.adminNote || '',
          },
          payout: withdrawal.method === 'UPI'
            ? { method: 'UPI', holderName: details.holderName || '', upiId: details.upiId || '' }
            : {
              method: 'BANK',
              holderName: details.holderName || '',
              bankName: details.bankName || '',
              accountNumber: details.accountNumber || '',
              ifsc: details.ifsc || '',
            },
        },
      };
    },

    async referralNotices(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const stack = referralStack(gate);
      const notices = stack.store.listAdminNotices ? await stack.store.listAdminNotices() : [];
      return { status: 200, body: { notices } };
    },

    async matureCommissions(req) {
      const gate = await requireReadyAdmin(req);
      if (gate.error) return gate.error;
      const stack = referralStack(gate);
      const result = await stack.referral.matureDue();
      await gate.cms.writeAudit('commission-mature', 'commission', null, result);
      return { status: 200, body: result };
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
          courses.push(fromHydrated(hydrated, 'public'));
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
        const course = canPreview
          ? fromHydrated(hydrated, 'preview')
          : unlocked
            ? fromHydrated(hydrated, 'student')
            : fromHydrated(hydrated, 'public');
        let progress = null;
        let resume = null;
        if (unlocked && email && ctx.cms.listLessonProgress) {
          const rows = await ctx.cms.listLessonProgress(email, query.id);
          const completedIds = (rows || [])
            .filter((row) => row.status === 'completed')
            .map((row) => row.lesson_id);
          progress = computeProgress(course.sections, completedIds);
          const target = continueTarget(query.section
            ? (course.sections || []).filter((section) => section.slug === query.section || section.id === query.section)
            : course.sections, completedIds);
          if (target.lesson) {
            const section = (course.sections || []).find((item) => item.id === target.lesson.sectionId);
            resume = {
              lessonId: target.lesson.id,
              sectionId: target.lesson.sectionId,
              sectionSlug: target.lesson.sectionSlug,
              label: continueLabel(query.section ? (section?.title || 'section') : course.name, target),
              sectionLabel: section ? continueLabel(section.title, continueTarget([section], completedIds)) : '',
            };
          }
        }
        if (query.section) {
          const visible = (course.sections || []).find((item) => item.slug === query.section || item.id === query.section);
          if (!visible || (visible.status !== 'published' && !canPreview)) {
            return { status: 404, body: { error: 'Learning section was not found.' } };
          }
        }
        return {
          status: 200,
          body: {
            course,
            progress,
            resume,
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
          ? fromHydrated(hydrated)
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

async function loadWithdrawalNotices(stack) {
  if (!stack?.store?.listAdminNotices) return [];
  try {
    const notices = await stack.store.listAdminNotices();
    return (notices || []).filter((row) => row.status === 'OPEN').slice(0, 8);
  } catch {
    return [];
  }
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
