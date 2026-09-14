import {
  clearSignedCookie,
  createSignedCookie,
  hashPassword,
  readSignedCookie,
  validateStudentPassword,
  verifyPasswordHash,
} from './access-auth.mjs';
import { passwordsMatch } from './admin-auth.mjs';
import { courseById } from './catalog.mjs';
import { createCms, fromHydrated } from './cms.mjs';
import { paymentsReady, razorpayMode, readEnv, supabaseReady } from './env.mjs';
import { computeProgress, continueLabel, continueTarget, sectionIsVisible } from './hierarchy.mjs';
import { isValidEmail, nameFromEmail, normalizeEmail } from './http.mjs';
import { createRazorpayClient, verifyCheckoutSignature, verifyWebhookSignature } from './razorpay.mjs';
import { buildReferralStack, createReferralHandlers } from './referral-handlers.mjs';
import { createSupabaseClient, publicEnrollment } from './supabase.mjs';

const STUDENT_COOKIE = 'gf_student';
const TPO_COOKIE = 'gf_tpo';
const STUDENT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const TPO_MAX_AGE_MS = 1000 * 60 * 60 * 12;

export function createHandlers(deps = {}) {
  const envSource = deps.env || process.env;
  const fetchImpl = deps.fetch || globalThis.fetch;

  function context() {
    const env = readEnv(envSource);
    return {
      env,
      paymentsReady: paymentsReady(env),
      supabaseReady: supabaseReady(env),
      razorpay: env.razorpayKeyId && env.razorpayKeySecret
        ? createRazorpayClient({
          keyId: env.razorpayKeyId,
          keySecret: env.razorpayKeySecret,
          fetchImpl,
        })
        : null,
      supabase: env.supabaseUrl && env.supabaseServiceRoleKey
        ? createSupabaseClient({
          url: env.supabaseUrl,
          serviceRoleKey: env.supabaseServiceRoleKey,
          fetchImpl,
        })
        : null,
    };
  }

  function referralStack() {
    if (deps.referralStack) return deps.referralStack;
    const { supabase } = context();
    if (!supabase && !deps.store) return null;
    return buildReferralStack({
      env: envSource,
      supabase,
      store: deps.store,
    });
  }

  function referralApi() {
    const stack = referralStack();
    if (!stack) return null;
    return createReferralHandlers({
      referral: stack.referral,
      withdrawals: stack.withdrawals,
      env: envSource,
    });
  }

  async function safeAward(payload) {
    const stack = referralStack();
    if (!stack?.referral) return;
    try {
      if (payload?.buyerEmail && payload?.order?.amount) {
        await stack.referral.recordQualifyingPurchase(payload.buyerEmail, payload.order.amount);
      }
      await stack.referral.awardForPaidOrder(payload);
    } catch (error) {
      console.error(JSON.stringify({
        event: 'referral_award_failed',
        message: error.message,
      }));
    }
  }

  async function safeBind(req, email) {
    const stack = referralStack();
    if (!stack?.referral || !email) return;
    try {
      await stack.referral.bindAttribution(req, email);
    } catch {
      // Attribution is best-effort until a verified purchase.
    }
  }

  function cmsFrom(supabase) {
    return supabase ? createCms({ supabaseRequest: supabase.request.bind(supabase) }) : null;
  }

  function notConfigured() {
    return {
      status: 503,
      body: {
        error: 'Supabase and Razorpay are not configured yet.',
        paymentsReady: false,
      },
    };
  }

  return {
    async publicConfig() {
      const { env, supabase } = context();
      let announcement = '';
      let checkoutName = env.checkoutName;
      if (supabase) {
        try {
          const rows = await supabase.request('site_settings?select=key,value');
          const settings = Object.fromEntries((rows || []).map((row) => [row.key, row.value]));
          if (settings.announcement) announcement = String(settings.announcement);
          if (settings.checkoutName) checkoutName = String(settings.checkoutName);
        } catch {
          // site_settings may not exist until the admin schema is applied.
        }
      }
      return {
        status: 200,
        body: {
          paymentsReady: paymentsReady(env),
          supabaseReady: supabaseReady(env),
          mode: razorpayMode(env.razorpayKeyId),
          checkoutName,
          announcement,
        },
      };
    },

    async createOrder(input = {}, req) {
      const { env, paymentsReady: ready, razorpay, supabase } = context();
      if (!ready) return notConfigured();

      const email = normalizeEmail(input.email);
      const courseId = String(input.courseId || '').trim();
      const college = String(input.college || '').trim();
      const studentName = String(input.studentName || '').trim() || nameFromEmail(email);
      const password = String(input.password || '');
      const course = await resolvePayableCourse(courseId, supabase);

      if (!isValidEmail(email)) {
        return { status: 400, body: { error: 'A valid college email is required.' } };
      }
      if (!course) {
        return { status: 400, body: { error: 'Unknown course.' } };
      }
      if (!college) {
        return { status: 400, body: { error: 'College is required so your TPO can see enrollment.' } };
      }

      const existing = await supabase.getEnrollment(email, course.id);
      if (existing?.paid) {
        const restored = await restorePaidAccess({ supabase, envSource, email, password, enrollment: existing });
        return restored;
      }

      const passwordError = validateStudentPassword(password);
      if (passwordError) {
        return { status: 400, body: { error: passwordError } };
      }
      const accountCheck = await matchStudentPassword(supabase, email, password);
      if (accountCheck.status) return accountCheck;
      await safeBind(req, email);

      const order = await razorpay.createOrder({
        amountPaise: course.price * 100,
        receipt: `gf_${course.id.slice(0, 12)}_${Date.now().toString(36)}`.slice(0, 40),
        notes: {
          email,
          courseId: course.id,
          college,
          studentName,
        },
      });

      return {
        status: 200,
        body: {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency || 'INR',
          keyId: env.razorpayKeyId,
          checkoutName: env.checkoutName,
          courseId: course.id,
          courseName: course.name,
        },
      };
    },

    async verifyPayment(input = {}, req) {
      const { env, paymentsReady: ready, razorpay, supabase } = context();
      if (!ready) return notConfigured();

      const email = normalizeEmail(input.email);
      const courseId = String(input.courseId || '').trim();
      const college = String(input.college || '').trim();
      const studentName = String(input.studentName || '').trim() || nameFromEmail(email);
      const password = String(input.password || '');
      const orderId = String(input.razorpay_order_id || '').trim();
      const paymentId = String(input.razorpay_payment_id || '').trim();
      const signature = String(input.razorpay_signature || '').trim();
      const course = await resolvePayableCourse(courseId, supabase);

      if (!isValidEmail(email) || !course || !orderId || !paymentId || !signature) {
        return { status: 400, body: { error: 'Payment details are incomplete.' } };
      }

      const valid = verifyCheckoutSignature({
        orderId,
        paymentId,
        signature,
        secret: env.razorpayKeySecret,
      });
      if (!valid) {
        return { status: 400, body: { error: 'Payment signature is invalid.' } };
      }

      const order = await razorpay.getOrder(orderId);
      const expectedAmount = course.price * 100;
      if (Number(order.amount) !== expectedAmount) {
        return { status: 400, body: { error: 'Order amount does not match this course.' } };
      }
      if (String(order.notes?.courseId || '') !== course.id) {
        return { status: 400, body: { error: 'Order does not match this course.' } };
      }
      if (normalizeEmail(order.notes?.email || '') !== email) {
        return { status: 400, body: { error: 'Order does not match this email.' } };
      }

      const savedCollege = String(order.notes?.college || college).trim();
      const savedName = String(order.notes?.studentName || studentName).trim();
      if (password) {
        const savedAccount = await persistStudentAccount(supabase, {
          email,
          password,
          name: savedName,
          college: savedCollege,
        });
        if (savedAccount.status && savedAccount.status !== 401) return savedAccount;
      }
      const rows = await supabase.upsertEnrollment({
        student_email: email,
        student_name: savedName,
        college: savedCollege,
        course_id: course.id,
        course_name: course.name,
        paid: true,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      await safeAward({
        req,
        buyerEmail: email,
        buyerName: savedName,
        course,
        order: { id: orderId, amount: Number(order.amount), currency: order.currency || 'INR' },
        paymentId,
      });

      return {
        status: 200,
        headers: studentCookieHeader(envSource, email),
        body: {
          paid: true,
          enrollment: publicEnrollment(row) || {
            studentEmail: email,
            studentName: savedName,
            college: savedCollege,
            courseId: course.id,
            courseName: course.name,
            paid: true,
            enrolledAt: new Date().toISOString(),
          },
        },
      };
    },

    async enrollments(req) {
      const { supabaseReady: ready, supabase } = context();
      if (!ready) return notConfigured();

      const session = readSignedCookie(req, STUDENT_COOKIE, envSource);
      const email = normalizeEmail(session?.subject);
      if (!isValidEmail(email)) {
        return { status: 401, body: { error: 'Student session required.' } };
      }

      const rows = await supabase.listByEmail(email);
      const account = await readStudentAccount(supabase, email);
      return {
        status: 200,
        body: {
          email,
          hasAccount: Boolean(account),
          enrollments: (rows || []).map(publicEnrollment),
        },
      };
    },

    async studentLogin(input = {}, req) {
      const { supabaseReady: ready, supabase } = context();
      if (!ready) return notConfigured();

      const email = normalizeEmail(input.email);
      const password = String(input.password || '');
      if (!isValidEmail(email) || !password) {
        return { status: 400, body: { error: 'Email and password are required.' } };
      }

      const account = await readStudentAccount(supabase, email);
      if (!account || !verifyPasswordHash(password, account.password_hash)) {
        return { status: 401, body: { error: 'Wrong email or password.' } };
      }

      const rows = await supabase.listByEmail(email);
      await safeBind(req, email);
      return {
        status: 200,
        headers: studentCookieHeader(envSource, email),
        body: {
          email,
          hasAccount: true,
          enrollments: (rows || []).map(publicEnrollment),
        },
      };
    },

    async studentPassword(req, input = {}) {
      const { supabaseReady: ready, supabase } = context();
      if (!ready) return notConfigured();

      const session = readSignedCookie(req, STUDENT_COOKIE, envSource);
      const email = normalizeEmail(session?.subject);
      if (!isValidEmail(email)) {
        return { status: 401, body: { error: 'Student session required.' } };
      }

      const password = String(input.password || '');
      const passwordError = validateStudentPassword(password);
      if (passwordError) {
        return { status: 400, body: { error: passwordError } };
      }

      const account = await readStudentAccount(supabase, email);
      if (account && !verifyPasswordHash(String(input.currentPassword || ''), account.password_hash)) {
        return { status: 401, body: { error: 'Current password is wrong.' } };
      }

      const saved = await persistStudentAccount(supabase, {
        email,
        password,
        name: account?.name || nameFromEmail(email),
        college: account?.college || '',
        replace: true,
      });
      if (saved.status) return saved;
      return { status: 200, body: { ok: true, email, hasAccount: true } };
    },

    async studentSession(req) {
      const { supabaseReady: ready, supabase } = context();
      if (!ready) return notConfigured();

      const session = readSignedCookie(req, STUDENT_COOKIE, envSource);
      const email = normalizeEmail(session?.subject);
      if (!isValidEmail(email)) {
        return { status: 401, body: { error: 'Student session required.' } };
      }
      const account = await readStudentAccount(supabase, email);
      return {
        status: 200,
        body: { email, hasAccount: Boolean(account) },
      };
    },

    async studentLogout() {
      return {
        status: 200,
        headers: { 'Set-Cookie': clearSignedCookie(STUDENT_COOKIE) },
        body: { ok: true },
      };
    },

    async lessonProgress(req, body = {}) {
      const { supabaseReady: ready, supabase } = context();
      if (!ready) return notConfigured();
      const session = readSignedCookie(req, STUDENT_COOKIE, envSource);
      const email = normalizeEmail(session?.subject);
      if (!isValidEmail(email)) {
        return { status: 401, body: { error: 'Student session required.' } };
      }
      const courseId = String(body.courseId || '').trim();
      const lessonId = String(body.lessonId || '').trim();
      if (!courseId || !lessonId) {
        return { status: 400, body: { error: 'Course and lesson are required.' } };
      }
      const enrollment = await supabase.getEnrollment(email, courseId);
      if (!enrollment?.paid) {
        return { status: 403, body: { error: 'Enroll to update lesson progress.' } };
      }
      const cms = cmsFrom(supabase);
      const hydrated = await cms.getHydrated(courseId);
      if (!hydrated || hydrated.row.status !== 'published') {
        return { status: 404, body: { error: 'Course not found.' } };
      }
      const course = fromHydrated(hydrated, 'student');
      if (!sectionIsVisible(course, lessonId)) {
        return { status: 404, body: { error: 'Lesson was not found.' } };
      }
      await cms.saveLessonProgress({
        email,
        courseId,
        lessonId,
        status: body.status === 'started' ? 'started' : 'completed',
      });
      const rows = await cms.listLessonProgress(email, courseId);
      const completedIds = (rows || []).filter((row) => row.status === 'completed').map((row) => row.lesson_id);
      const progress = computeProgress(course.sections, completedIds);
      const target = continueTarget(course.sections, completedIds);
      return {
        status: 200,
        body: {
          ok: true,
          progress,
          resume: target.lesson
            ? {
              lessonId: target.lesson.id,
              sectionId: target.lesson.sectionId,
              sectionSlug: target.lesson.sectionSlug,
              label: continueLabel(course.name, target),
            }
            : null,
        },
      };
    },

    async tpoLogout() {
      return {
        status: 200,
        headers: { 'Set-Cookie': clearSignedCookie(TPO_COOKIE) },
        body: { ok: true },
      };
    },

    async tpoSession(body = {}) {
      const { env } = context();
      if (!env.tpoAccessCode) {
        return { status: 503, body: { error: 'TPO access is not configured.' } };
      }
      const college = String(body.college || '').trim();
      if (!college) {
        return { status: 400, body: { error: 'College is required.' } };
      }
      if (!passwordsMatch(body.accessCode, env.tpoAccessCode)) {
        return { status: 401, body: { error: 'Wrong TPO access code.' } };
      }
      const { cookie, expiresAt } = createSignedCookie(TPO_COOKIE, college, envSource, TPO_MAX_AGE_MS);
      return {
        status: 200,
        headers: { 'Set-Cookie': cookie },
        body: { ok: true, college, expiresAt },
      };
    },

    async tpoEnrollments(query = {}, req) {
      const { supabaseReady: ready, supabase } = context();
      if (!ready) return notConfigured();

      const session = readSignedCookie(req, TPO_COOKIE, envSource);
      const college = String(session?.subject || '').trim();
      if (!college) {
        return { status: 401, body: { error: 'TPO workspace sign-in required.' } };
      }
      if (query.college && query.college.trim().toLowerCase() !== college.toLowerCase()) {
        return { status: 403, body: { error: 'This TPO session is locked to another college.' } };
      }

      const rows = await supabase.listByCollege(college);
      return {
        status: 200,
        body: {
          college,
          enrollments: (rows || []).map(publicEnrollment),
        },
      };
    },

    async webhook({ rawBody = '', signature = '' } = {}) {
      const { env, paymentsReady: ready, razorpay, supabase } = context();
      if (!ready) return notConfigured();
      if (!env.razorpayWebhookSecret) {
        return { status: 503, body: { error: 'Razorpay webhook secret is not configured.' } };
      }
      if (!verifyWebhookSignature({ rawBody, signature, secret: env.razorpayWebhookSecret })) {
        return { status: 400, body: { error: 'Webhook signature is invalid.' } };
      }

      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return { status: 400, body: { error: 'Webhook body is not JSON.' } };
      }

      if (event.event === 'refund.processed' || event.event === 'refund.created') {
        const refund = event.payload?.refund?.entity || {};
        const stack = referralStack();
        if (stack?.referral) {
          try {
            await stack.referral.applyRefund({
              providerPaymentId: String(refund.payment_id || ''),
              refundedPaise: Number(refund.amount) || 0,
              full: String(refund.status || '') === 'processed' && !refund.partial,
            });
          } catch (error) {
            console.error(JSON.stringify({ event: 'referral_refund_failed', message: error.message }));
          }
        }
        return { status: 200, body: { ok: true, refund: true } };
      }

      if (String(event.event || '').startsWith('payment.dispute.')) {
        const dispute = event.payload?.dispute?.entity || event.payload?.payment?.entity || {};
        const stack = referralStack();
        if (stack?.referral) {
          const outcome = event.event.endsWith('won')
            ? 'won'
            : event.event.endsWith('lost')
              ? 'lost'
              : 'created';
          try {
            await stack.referral.applyDispute({
              providerOrderId: String(dispute.order_id || ''),
              providerPaymentId: String(dispute.payment_id || dispute.id || ''),
              outcome,
            });
          } catch (error) {
            console.error(JSON.stringify({ event: 'referral_dispute_failed', message: error.message }));
          }
        }
        return { status: 200, body: { ok: true, dispute: true } };
      }

      if (event.event !== 'payment.captured') {
        return { status: 200, body: { ignored: true } };
      }

      const payment = event.payload?.payment?.entity || {};
      const orderId = String(payment.order_id || '');
      const paymentId = String(payment.id || '');
      if (!orderId || !paymentId) {
        return { status: 400, body: { error: 'Webhook payment is incomplete.' } };
      }

      const order = await razorpay.getOrder(orderId);
      const course = await resolvePayableCourse(order.notes?.courseId, supabase);
      const email = normalizeEmail(order.notes?.email || payment.email);
      if (!course || !isValidEmail(email)) {
        return { status: 200, body: { ignored: true } };
      }

      const rows = await supabase.upsertEnrollment({
        student_email: email,
        student_name: String(order.notes?.studentName || nameFromEmail(email)).trim(),
        college: String(order.notes?.college || '').trim(),
        course_id: course.id,
        course_name: course.name,
        paid: true,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      await safeAward({
        req: {},
        buyerEmail: email,
        buyerName: String(order.notes?.studentName || nameFromEmail(email)).trim(),
        course,
        order: { id: orderId, amount: Number(order.amount), currency: order.currency || 'INR' },
        paymentId,
        eventId: String(event.id || `payment.captured:${paymentId}`),
      });
      return { status: 200, body: { paid: true, enrollment: publicEnrollment(row) } };
    },

    async visitReferral(req, query = {}) {
      const api = referralApi();
      if (!api) return { status: 302, redirect: safeHome(query.next), headers: { 'Cache-Control': 'no-store' }, body: { redirect: '/' } };
      return api.visit(req, query);
    },

    async referralMe(req, query = {}) {
      const api = referralApi();
      if (!api) return { status: 503, body: { error: 'Referral program is not configured.' } };
      return api.me(req, query);
    },

    async referralTerms(req) {
      const api = referralApi();
      if (!api) return { status: 503, body: { error: 'Referral program is not configured.' } };
      return api.acceptTerms(req);
    },

    async referralPayout(req, body = {}, method = 'GET') {
      const api = referralApi();
      if (!api) return { status: 503, body: { error: 'Referral program is not configured.' } };
      return api.payout(req, body, method);
    },

    async referralWithdraw(req, body = {}) {
      const api = referralApi();
      if (!api) return { status: 503, body: { error: 'Referral program is not configured.' } };
      return api.withdraw(req, body);
    },

    async referralWithdrawals(req) {
      const api = referralApi();
      if (!api) return { status: 503, body: { error: 'Referral program is not configured.' } };
      return api.myWithdrawals(req);
    },

    async referralMature(req, body = {}) {
      const api = referralApi();
      if (!api) return { status: 503, body: { error: 'Referral program is not configured.' } };
      return api.mature(req, body);
    },
  };
}

function safeHome(next) {
  const raw = String(next || '').trim();
  return raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('://') ? '/#courses' : '/#courses';
}

async function readStudentAccount(supabase, email) {
  if (!supabase?.getStudentAccount || !email) return null;
  try {
    return await supabase.getStudentAccount(email);
  } catch (error) {
    if (Number(error.status) === 404) return null;
    throw error;
  }
}

async function matchStudentPassword(supabase, email, password) {
  const account = await readStudentAccount(supabase, email);
  if (!account) return { account: null };
  if (!verifyPasswordHash(password, account.password_hash)) {
    return { status: 401, body: { error: 'Wrong password for this email.' } };
  }
  return { account };
}

async function persistStudentAccount(supabase, {
  email,
  password,
  name = '',
  college = '',
  replace = false,
} = {}) {
  const passwordError = validateStudentPassword(password);
  if (passwordError) {
    return { status: 400, body: { error: passwordError } };
  }
  const existing = await readStudentAccount(supabase, email);
  if (existing && !replace && !verifyPasswordHash(password, existing.password_hash)) {
    return { status: 401, body: { error: 'Wrong password for this email.' } };
  }
  try {
    await supabase.upsertStudentAccount({
      email,
      password_hash: replace || !existing ? hashPassword(password) : existing.password_hash,
      name: name || existing?.name || '',
      college: college || existing?.college || '',
    });
  } catch (error) {
    if (Number(error.status) === 404) return {};
    throw error;
  }
  return {};
}

async function restorePaidAccess({ supabase, envSource, email, password, enrollment }) {
  const account = await readStudentAccount(supabase, email);
  if (account) {
    if (!verifyPasswordHash(password, account.password_hash)) {
      return {
        status: 409,
        body: {
          alreadyEnrolled: true,
          error: 'You already bought this course. Sign in with the password you set at checkout.',
        },
      };
    }
    return {
      status: 200,
      headers: studentCookieHeader(envSource, email),
      body: {
        alreadyEnrolled: true,
        enrollment: publicEnrollment(enrollment),
      },
    };
  }
  return {
    status: 409,
    body: {
      alreadyEnrolled: true,
      needsLogin: true,
      error: 'You already bought this course. Sign in if you set a password, or set one from the browser you used to pay.',
    },
  };
}

function studentCookieHeader(envSource, email) {
  try {
    const { cookie } = createSignedCookie(STUDENT_COOKIE, email, envSource, STUDENT_MAX_AGE_MS);
    return { 'Set-Cookie': cookie };
  } catch {
    return undefined;
  }
}

async function resolvePayableCourse(courseId, supabase) {
  if (supabase?.request) {
    try {
      const rows = await supabase.request(
        `courses?id=eq.${encodeURIComponent(courseId)}&status=eq.published&select=id,name,price&limit=1`,
      );
      if (rows?.[0]) {
        return {
          id: rows[0].id,
          name: rows[0].name,
          price: Number(rows[0].price) || 0,
        };
      }
    } catch {
      // Use the static catalog if the CMS table is missing.
    }
  }
  return courseById(courseId);
}

export const handlers = createHandlers();
