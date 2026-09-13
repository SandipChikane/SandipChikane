import { courseById } from './catalog.mjs';
import { paymentsReady, razorpayMode, readEnv, supabaseReady } from './env.mjs';
import { isValidEmail, nameFromEmail, normalizeEmail } from './http.mjs';
import { createRazorpayClient, verifyCheckoutSignature, verifyWebhookSignature } from './razorpay.mjs';
import { createSupabaseClient, publicEnrollment } from './supabase.mjs';

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

    async createOrder(input = {}) {
      const { env, paymentsReady: ready, razorpay, supabase } = context();
      if (!ready) return notConfigured();

      const email = normalizeEmail(input.email);
      const courseId = String(input.courseId || '').trim();
      const college = String(input.college || '').trim();
      const studentName = String(input.studentName || '').trim() || nameFromEmail(email);
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
        return {
          status: 409,
          body: {
            error: 'Already enrolled',
            enrolled: true,
            enrollment: publicEnrollment(existing),
          },
        };
      }

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

    async verifyPayment(input = {}) {
      const { env, paymentsReady: ready, razorpay, supabase } = context();
      if (!ready) return notConfigured();

      const email = normalizeEmail(input.email);
      const courseId = String(input.courseId || '').trim();
      const college = String(input.college || '').trim();
      const studentName = String(input.studentName || '').trim() || nameFromEmail(email);
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

      return {
        status: 200,
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

    async enrollments(query = {}) {
      const { supabaseReady: ready, supabase } = context();
      if (!ready) return notConfigured();

      const email = normalizeEmail(query.email);
      if (!isValidEmail(email)) {
        return { status: 400, body: { error: 'A valid email is required.' } };
      }

      const rows = await supabase.listByEmail(email);
      return {
        status: 200,
        body: {
          enrollments: (rows || []).map(publicEnrollment),
        },
      };
    },

    async tpoEnrollments(query = {}) {
      const { supabaseReady: ready, supabase } = context();
      if (!ready) return notConfigured();

      const college = String(query.college || '').trim();
      if (!college) {
        return { status: 400, body: { error: 'College is required.' } };
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
      return { status: 200, body: { paid: true, enrollment: publicEnrollment(row) } };
    },
  };
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
