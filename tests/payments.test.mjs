import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { COURSE_CATALOG } from '../lib/catalog.mjs';
import { createHandlers } from '../lib/handlers.mjs';
import { publicEnrollment } from '../lib/supabase.mjs';
import { verifyCheckoutSignature, verifyWebhookSignature } from '../lib/razorpay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function signCheckout(orderId, paymentId, secret) {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

describe('catalog', () => {
  it('matches the browser course prices and ids', () => {
    const source = readFileSync(path.join(ROOT, 'enrollment.js'), 'utf8');
    for (const course of COURSE_CATALOG) {
      assert.match(source, new RegExp(`id: '${course.id}'`));
      assert.match(source, new RegExp(`price: ${course.price}`));
    }
  });
});

describe('signatures', () => {
  it('accepts a valid Razorpay checkout signature', () => {
    const secret = 'test_secret';
    const signature = signCheckout('order_1', 'pay_1', secret);
    assert.equal(verifyCheckoutSignature({
      orderId: 'order_1',
      paymentId: 'pay_1',
      signature,
      secret,
    }), true);
  });

  it('rejects a tampered checkout signature', () => {
    assert.equal(verifyCheckoutSignature({
      orderId: 'order_1',
      paymentId: 'pay_1',
      signature: 'nope',
      secret: 'test_secret',
    }), false);
  });

  it('accepts a valid webhook signature', () => {
    const secret = 'hook_secret';
    const rawBody = '{"event":"payment.captured"}';
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    assert.equal(verifyWebhookSignature({ rawBody, signature, secret }), true);
  });
});

describe('tpo payload', () => {
  it('strips Razorpay ids from TPO-safe enrollments', () => {
    const safe = publicEnrollment({
      student_email: 'aarav@vitstudent.ac.in',
      student_name: 'Aarav Khanna',
      college: 'VIT Vellore',
      course_id: 'data-analytics',
      course_name: 'Data Analytics in the Wild',
      paid: true,
      enrolled_at: '2026-09-13T00:00:00.000Z',
      razorpay_order_id: 'order_secret',
      razorpay_payment_id: 'pay_secret',
    });
    assert.equal(safe.courseId, 'data-analytics');
    assert.equal(safe.paid, true);
    assert.equal('razorpay_order_id' in safe, false);
    assert.equal('razorpay_payment_id' in safe, false);
    assert.equal(JSON.stringify(safe).includes('order_secret'), false);
  });
});

describe('handlers without credentials', () => {
  const api = createHandlers({ env: {} });

  it('create-order returns 503 when keys are missing', async () => {
    const result = await api.createOrder({
      email: 'student@vitstudent.ac.in',
      courseId: 'data-analytics',
      college: 'VIT Vellore',
    });
    assert.equal(result.status, 503);
    assert.equal(result.body.paymentsReady, false);
  });

  it('verify-payment does not mark a course paid without keys', async () => {
    const result = await api.verifyPayment({
      email: 'student@vitstudent.ac.in',
      courseId: 'data-analytics',
      razorpay_order_id: 'order_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'fake',
    });
    assert.equal(result.status, 503);
    assert.equal(result.body.paid, undefined);
  });

  it('public-config reports payments as not ready', async () => {
    const result = await api.publicConfig();
    assert.equal(result.status, 200);
    assert.equal(result.body.paymentsReady, false);
    assert.equal(result.body.supabaseReady, false);
    assert.equal(result.body.announcement, '');
  });
});

describe('handlers with credentials', () => {
  const env = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    RAZORPAY_KEY_ID: 'rzp_test_demo',
    RAZORPAY_KEY_SECRET: 'test_secret',
  };

  it('rejects an unknown course', async () => {
    const api = createHandlers({ env, fetch: async () => new Response('[]') });
    const result = await api.createOrder({
      email: 'student@vitstudent.ac.in',
      courseId: 'missing-course',
      college: 'VIT Vellore',
    });
    assert.equal(result.status, 400);
  });

  it('creates a Razorpay order for a known course', async () => {
    const calls = [];
    const api = createHandlers({
      env,
      fetch: async (url, options = {}) => {
        calls.push({ url: String(url), options });
        if (String(url).includes('/rest/v1/enrollments?')) {
          return new Response('[]', { status: 200 });
        }
        if (String(url).includes('/v1/orders')) {
          return new Response(JSON.stringify({
            id: 'order_123',
            amount: 1490000,
            currency: 'INR',
          }), { status: 200 });
        }
        return new Response('{}', { status: 404 });
      },
    });
    const result = await api.createOrder({
      email: 'Student@vitstudent.ac.in',
      courseId: 'data-analytics',
      college: 'VIT Vellore',
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.orderId, 'order_123');
    assert.equal(result.body.amount, 1490000);
    assert.equal(result.body.keyId, 'rzp_test_demo');
    assert.match(calls.at(-1).url, /api\.razorpay\.com\/v1\/orders/);
  });

  it('rejects a bad payment signature', async () => {
    const api = createHandlers({ env, fetch: async () => new Response('{}') });
    const result = await api.verifyPayment({
      email: 'student@vitstudent.ac.in',
      courseId: 'data-analytics',
      college: 'VIT Vellore',
      razorpay_order_id: 'order_123',
      razorpay_payment_id: 'pay_123',
      razorpay_signature: 'bad-signature',
    });
    assert.equal(result.status, 400);
    assert.match(result.body.error, /signature/i);
  });

  it('verifies a signature and stores a TPO-safe enrollment', async () => {
    const signature = signCheckout('order_123', 'pay_123', env.RAZORPAY_KEY_SECRET);
    const api = createHandlers({
      env,
      fetch: async (url, options = {}) => {
        if (String(url).includes('/v1/orders/order_123')) {
          return new Response(JSON.stringify({
            id: 'order_123',
            amount: 1490000,
            notes: {
              email: 'student@vitstudent.ac.in',
              courseId: 'data-analytics',
              college: 'VIT Vellore',
              studentName: 'Student',
            },
          }), { status: 200 });
        }
        if (String(url).includes('/rest/v1/enrollments')) {
          const body = JSON.parse(options.body);
          assert.equal(body.paid, true);
          assert.equal(body.razorpay_payment_id, 'pay_123');
          return new Response(JSON.stringify([{
            student_email: body.student_email,
            student_name: body.student_name,
            college: body.college,
            course_id: body.course_id,
            course_name: body.course_name,
            paid: true,
            enrolled_at: '2026-09-13T00:00:00.000Z',
            razorpay_order_id: body.razorpay_order_id,
            razorpay_payment_id: body.razorpay_payment_id,
          }]), { status: 201 });
        }
        return new Response('{}', { status: 404 });
      },
    });
    const result = await api.verifyPayment({
      email: 'student@vitstudent.ac.in',
      courseId: 'data-analytics',
      college: 'VIT Vellore',
      razorpay_order_id: 'order_123',
      razorpay_payment_id: 'pay_123',
      razorpay_signature: signature,
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.paid, true);
    assert.equal(result.body.enrollment.courseId, 'data-analytics');
    assert.equal(JSON.stringify(result.body).includes('pay_123'), false);
  });

  it('lists TPO enrollments without payment ids', async () => {
    const api = createHandlers({
      env,
      fetch: async (url) => {
        assert.match(String(url), /tpo_enrollments/);
        return new Response(JSON.stringify([{
          student_email: 'aarav@vitstudent.ac.in',
          student_name: 'Aarav Khanna',
          college: 'VIT Vellore',
          course_id: 'data-analytics',
          course_name: 'Data Analytics in the Wild',
          paid: true,
          enrolled_at: '2026-09-13T00:00:00.000Z',
        }]), { status: 200 });
      },
    });
    const result = await api.tpoEnrollments({ college: 'VIT Vellore' });
    assert.equal(result.status, 200);
    assert.equal(result.body.enrollments[0].studentEmail, 'aarav@vitstudent.ac.in');
    assert.equal(JSON.stringify(result.body).includes('razorpay'), false);
  });
});
