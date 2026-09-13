import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createSignedCookie } from '../lib/access-auth.mjs';
import { createHandlers } from '../lib/handlers.mjs';
import { createReferralServices, safeInternalPath } from '../lib/referral.mjs';
import { createMemoryReferralStore } from '../lib/referral-store.mjs';
import { createWithdrawalServices } from '../lib/withdrawals.mjs';
import { verifyWebhookSignature } from '../lib/razorpay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COURSE = { id: 'data-analytics', name: 'Data Analytics in the Wild', price: 14900, status: 'published' };
const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  RAZORPAY_KEY_ID: 'rzp_test_demo',
  RAZORPAY_KEY_SECRET: 'test_secret',
  RAZORPAY_WEBHOOK_SECRET: 'hook_secret',
  ADMIN_SESSION_SECRET: 'test-session-secret',
};

function enabledStore(extra = {}) {
  return createMemoryReferralStore({
    settings: {
      programEnabled: true,
      withdrawalEnabled: true,
      defaultCommissionType: 'FIXED_AMOUNT',
      defaultFixedPaise: 50000,
      defaultHoldingDays: 0,
      minWithdrawalPaise: 10000,
      maxWithdrawalPaise: 5000000,
      calculationBasis: 'ACTUAL_AMOUNT_PAID',
    },
    profiles: extra.profiles || [
      { email: 'a@college.edu', code: 'ALICE7K92', status: 'active' },
    ],
    attributions: extra.attributions || [],
    products: extra.products || {
      'data-analytics': { referralEnabled: true, referralActive: true, commissionSource: 'GLOBAL_DEFAULT' },
    },
  });
}

function withCms(inner) {
  return async (url, options = {}) => {
    const href = String(url);
    if (href.includes('/rest/v1/courses?')) {
      return new Response(JSON.stringify(href.includes(`id=eq.${COURSE.id}`) ? [COURSE] : []), { status: 200 });
    }
    return inner(url, options);
  };
}

function signCheckout(orderId, paymentId, secret) {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

function studentReq(email, extra = {}) {
  const { cookie } = createSignedCookie('gf_student', email, ENV, 60_000);
  return {
    headers: {
      host: '127.0.0.1:4174',
      origin: 'http://127.0.0.1:4174',
      cookie: cookie.split(';')[0],
      ...extra.headers,
    },
  };
}

describe('referral links and attribution', () => {
  it('accepts a valid referral code and stores a click', async () => {
    const store = enabledStore();
    const referral = createReferralServices({ store, env: ENV });
    const result = await referral.visitReferral({ headers: { host: 'example.test' } }, { code: 'ALICE7K92', next: '/course.html?course=data-analytics' });
    assert.equal(result.status, 302);
    assert.equal(result.redirect, '/course.html?course=data-analytics');
    assert.equal(await store.countClicks('a@college.edu'), 1);
  });

  it('fails safely for an invalid code', async () => {
    const store = enabledStore();
    const referral = createReferralServices({ store, env: ENV });
    const result = await referral.visitReferral({ headers: {} }, { code: 'NOPE1234', next: '/dashboard.html' });
    assert.equal(result.redirect, '/dashboard.html');
    assert.equal(await store.countClicks('a@college.edu'), 0);
  });

  it('blocks self-referral and keeps the first referrer', async () => {
    const store = enabledStore();
    const referral = createReferralServices({ store, env: ENV });
    const { cookie } = createSignedCookie('gf_ref', 'ALICE7K92', ENV, 60_000);
    const req = { headers: { cookie: cookie.split(';')[0] } };
    const self = await referral.bindAttribution(req, 'a@college.edu');
    assert.equal(self, null);
    const first = await referral.bindAttribution(req, 'b@college.edu');
    assert.equal(first.referrerEmail, 'a@college.edu');
    await store.upsertProfile({ email: 'other@college.edu', code: 'OTHER9X21', status: 'active' });
    const { cookie: other } = createSignedCookie('gf_ref', 'OTHER9X21', ENV, 60_000);
    const again = await referral.bindAttribution({ headers: { cookie: other.split(';')[0] } }, 'b@college.edu');
    assert.equal(again.referrerEmail, 'a@college.edu');
    assert.equal(again.alreadyLocked, true);
  });

  it('rejects open redirects', () => {
    assert.equal(safeInternalPath('https://evil.example'), '/#courses');
    assert.equal(safeInternalPath('//evil.example'), '/#courses');
    assert.equal(safeInternalPath('/api/admin'), '/#courses');
    assert.equal(safeInternalPath('/course.html?course=data-analytics'), '/course.html?course=data-analytics');
  });
});

describe('referral commissions after payment', () => {
  it('does not pay on registration or checkout start', async () => {
    const store = enabledStore();
    const api = createHandlers({ env: ENV, store, fetch: withCms(async (url) => {
      if (String(url).includes('/rest/v1/enrollments?')) return new Response('[]', { status: 200 });
      if (String(url).includes('/rest/v1/student_accounts')) return new Response('[]', { status: 200 });
      if (String(url).includes('/v1/orders')) {
        return new Response(JSON.stringify({ id: 'order_start', amount: 1490000, currency: 'INR' }), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    }) });
    const { cookie } = createSignedCookie('gf_ref', 'ALICE7K92', ENV, 60_000);
    const req = { headers: { cookie: cookie.split(';')[0] } };
    const started = await api.createOrder({
      email: 'b@college.edu',
      courseId: 'data-analytics',
      college: 'VIT',
      password: 'campus-pass-1',
    }, req);
    assert.equal(started.status, 200);
    assert.equal((await store.listCommissions()).length, 0);
  });

  it('does not pay on a failed signature', async () => {
    const store = enabledStore();
    const api = createHandlers({ env: ENV, store, fetch: withCms(async () => new Response('{}')) });
    const result = await api.verifyPayment({
      email: 'b@college.edu',
      courseId: 'data-analytics',
      college: 'VIT',
      razorpay_order_id: 'order_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'bad',
    });
    assert.equal(result.status, 400);
    assert.equal((await store.listCommissions()).length, 0);
  });

  it('creates one commission after a verified eligible payment', async () => {
    const store = enabledStore({
      attributions: [{ referredEmail: 'b@college.edu', referrerEmail: 'a@college.edu', code: 'ALICE7K92' }],
    });
    const api = createHandlers({
      env: ENV,
      store,
      fetch: withCms(async (url, options = {}) => {
        if (String(url).includes('/v1/orders/order_ok')) {
          return new Response(JSON.stringify({
            id: 'order_ok',
            amount: 1490000,
            currency: 'INR',
            notes: { email: 'b@college.edu', courseId: 'data-analytics', college: 'VIT', studentName: 'B' },
          }), { status: 200 });
        }
        if (String(url).includes('/rest/v1/enrollments')) {
          return new Response(JSON.stringify([{
            student_email: 'b@college.edu',
            course_id: 'data-analytics',
            course_name: COURSE.name,
            paid: true,
            enrolled_at: '2026-09-13T00:00:00.000Z',
          }]), { status: 201 });
        }
        if (String(url).includes('/rest/v1/student_accounts')) return new Response('[]', { status: 200 });
        return new Response(JSON.stringify(options.body || {}), { status: 200 });
      }),
    });
    const signature = signCheckout('order_ok', 'pay_ok', ENV.RAZORPAY_KEY_SECRET);
    const result = await api.verifyPayment({
      email: 'b@college.edu',
      courseId: 'data-analytics',
      college: 'VIT',
      password: 'campus-pass-1',
      razorpay_order_id: 'order_ok',
      razorpay_payment_id: 'pay_ok',
      razorpay_signature: signature,
    });
    assert.equal(result.status, 200);
    const commissions = await store.listCommissions();
    assert.equal(commissions.length, 1);
    assert.equal(commissions[0].referrerEmail, 'a@college.edu');
    assert.equal(commissions[0].commissionPaise, 50000);
    assert.equal(commissions[0].amountPaidPaise, 1490000);
  });

  it('creates no commission for a non-eligible product', async () => {
    const store = enabledStore({
      attributions: [{ referredEmail: 'b@college.edu', referrerEmail: 'a@college.edu', code: 'ALICE7K92' }],
      products: { 'data-analytics': { referralEnabled: false } },
    });
    const referral = createReferralServices({ store, env: ENV });
    const result = await referral.awardForPaidOrder({
      req: {},
      buyerEmail: 'b@college.edu',
      course: COURSE,
      order: { id: 'order_no', amount: 1490000, currency: 'INR' },
      paymentId: 'pay_no',
    });
    assert.equal(result.awarded, false);
    assert.equal(result.reason, 'product_not_eligible');
  });

  it('pays only the direct referrer in an A→B→C chain', async () => {
    const store = enabledStore({
      profiles: [
        { email: 'a@college.edu', code: 'ALICE7K92', status: 'active' },
        { email: 'b@college.edu', code: 'BOB12K34', status: 'active' },
      ],
      attributions: [
        { referredEmail: 'b@college.edu', referrerEmail: 'a@college.edu', code: 'ALICE7K92' },
        { referredEmail: 'c@college.edu', referrerEmail: 'b@college.edu', code: 'BOB12K34' },
      ],
    });
    const referral = createReferralServices({ store, env: ENV });
    await referral.awardForPaidOrder({
      req: {},
      buyerEmail: 'b@college.edu',
      course: COURSE,
      order: { id: 'order_b', amount: 1490000, currency: 'INR' },
      paymentId: 'pay_b',
    });
    await referral.awardForPaidOrder({
      req: {},
      buyerEmail: 'c@college.edu',
      course: COURSE,
      order: { id: 'order_c', amount: 1490000, currency: 'INR' },
      paymentId: 'pay_c',
    });
    const all = await store.listCommissions();
    assert.equal(all.length, 2);
    assert.equal(all.find((row) => row.referredEmail === 'b@college.edu').referrerEmail, 'a@college.edu');
    assert.equal(all.find((row) => row.referredEmail === 'c@college.edu').referrerEmail, 'b@college.edu');
    assert.equal(all.filter((row) => row.referrerEmail === 'a@college.edu' && row.referredEmail === 'c@college.edu').length, 0);
  });

  it('keeps historical commission after admin changes the rule', async () => {
    const store = enabledStore({
      attributions: [{ referredEmail: 'b@college.edu', referrerEmail: 'a@college.edu', code: 'ALICE7K92' }],
    });
    const referral = createReferralServices({ store, env: ENV });
    await referral.awardForPaidOrder({
      req: {},
      buyerEmail: 'b@college.edu',
      course: COURSE,
      order: { id: 'order_old', amount: 1490000, currency: 'INR' },
      paymentId: 'pay_old',
    });
    await store.saveGlobalSettings({
      ...(await store.getGlobalSettings()),
      defaultFixedPaise: 70000,
      ruleVersion: 2,
    });
    await referral.awardForPaidOrder({
      req: {},
      buyerEmail: 'b@college.edu',
      course: COURSE,
      order: { id: 'order_new', amount: 1490000, currency: 'INR' },
      paymentId: 'pay_new',
    });
    const [first, second] = await store.listCommissions();
    assert.equal(first.commissionPaise, 50000);
    assert.equal(second.commissionPaise, 70000);
    assert.equal(first.ruleVersion, 1);
  });

  it('replays a captured webhook without duplicating commission or enrollment side effects', async () => {
    const store = enabledStore({
      attributions: [{ referredEmail: 'b@college.edu', referrerEmail: 'a@college.edu', code: 'ALICE7K92' }],
    });
    const rawBody = JSON.stringify({
      event: 'payment.captured',
      id: 'evt_1',
      payload: { payment: { entity: { id: 'pay_hook', order_id: 'order_hook' } } },
    });
    const signature = crypto.createHmac('sha256', ENV.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    assert.equal(verifyWebhookSignature({ rawBody, signature, secret: ENV.RAZORPAY_WEBHOOK_SECRET }), true);
    let enrollments = 0;
    const api = createHandlers({
      env: ENV,
      store,
      fetch: withCms(async (url, options = {}) => {
        if (String(url).includes('/v1/orders/order_hook')) {
          return new Response(JSON.stringify({
            id: 'order_hook',
            amount: 1490000,
            currency: 'INR',
            notes: { email: 'b@college.edu', courseId: 'data-analytics', college: 'VIT', studentName: 'B' },
          }), { status: 200 });
        }
        if (String(url).includes('/rest/v1/enrollments') && options.method === 'POST') {
          enrollments += 1;
          return new Response(JSON.stringify([{ student_email: 'b@college.edu', course_id: 'data-analytics', paid: true }]), { status: 201 });
        }
        return new Response('[]', { status: 200 });
      }),
    });
    const first = await api.webhook({ rawBody, signature });
    const second = await api.webhook({ rawBody, signature });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal((await store.listCommissions()).length, 1);
    assert.equal((await store.listLedger('a@college.edu')).filter((row) => row.type === 'REFERRAL_COMMISSION' && row.amountPaise > 0).length, 1);
    assert.equal(enrollments, 2);
  });

  it('rejects a spoofed webhook signature', async () => {
    const store = enabledStore();
    const api = createHandlers({ env: ENV, store, fetch: async () => new Response('{}') });
    const result = await api.webhook({ rawBody: '{"event":"payment.captured"}', signature: 'nope' });
    assert.equal(result.status, 400);
    assert.equal((await store.listCommissions()).length, 0);
  });

  it('matures a pending commission only after the hold and eligibility checks', async () => {
    const store = enabledStore({
      attributions: [{ referredEmail: 'b@college.edu', referrerEmail: 'a@college.edu', code: 'ALICE7K92' }],
    });
    const now = { value: new Date('2026-09-13T00:00:00.000Z') };
    const referral = createReferralServices({ store, env: ENV, now: () => now.value });
    await store.saveGlobalSettings({ ...(await store.getGlobalSettings()), defaultHoldingDays: 7 });
    await referral.awardForPaidOrder({
      req: {},
      buyerEmail: 'b@college.edu',
      course: COURSE,
      order: { id: 'order_hold', amount: 1490000, currency: 'INR' },
      paymentId: 'pay_hold',
    });
    assert.equal((await store.listCommissions())[0].status, 'PENDING');
    await referral.matureDue();
    assert.equal((await store.listCommissions())[0].status, 'PENDING');
    now.value = new Date('2026-09-21T00:00:00.000Z');
    await referral.matureDue();
    assert.equal((await store.listCommissions())[0].status, 'AVAILABLE');
    await referral.matureDue();
    assert.equal((await store.listCommissions()).filter((row) => row.status === 'AVAILABLE').length, 1);
  });

  it('reverses a refunded pending commission and keeps the ledger', async () => {
    const store = enabledStore({
      attributions: [{ referredEmail: 'b@college.edu', referrerEmail: 'a@college.edu', code: 'ALICE7K92' }],
    });
    const referral = createReferralServices({ store, env: ENV });
    await referral.awardForPaidOrder({
      req: {},
      buyerEmail: 'b@college.edu',
      course: COURSE,
      order: { id: 'order_ref', amount: 1490000, currency: 'INR' },
      paymentId: 'pay_ref',
    });
    const refunded = await referral.applyRefund({ providerOrderId: 'order_ref', refundedPaise: 1490000, full: true });
    assert.equal(refunded.reversed, true);
    assert.equal((await store.getCommissionByOrder('order_ref')).status, 'REVERSED');
    assert.ok((await store.listLedger('a@college.edu')).some((row) => row.type === 'COMMISSION_REVERSAL'));
    assert.ok((await store.listLedger('a@college.edu')).some((row) => row.type === 'REFERRAL_COMMISSION'));
  });
});

describe('withdrawals', () => {
  it('prevents two simultaneous full-balance withdrawals', async () => {
    const store = enabledStore();
    await store.insertCommission({
      referrerEmail: 'a@college.edu',
      referredEmail: 'b@college.edu',
      courseId: COURSE.id,
      providerOrderId: 'order_w',
      commissionPaise: 50000,
      amountPaidPaise: 1490000,
      listPricePaise: 1490000,
      status: 'AVAILABLE',
      currency: 'INR',
    });
    await store.savePayoutAccount({
      email: 'a@college.edu',
      method: 'UPI',
      encryptedPayload: 'x',
      fingerprint: 'f1',
    });
    const withdrawals = createWithdrawalServices({ store, env: ENV });
    const settings = await store.getGlobalSettings();
    const [one, two] = await Promise.allSettled([
      withdrawals.requestWithdrawal({
        email: 'a@college.edu',
        amountPaise: 50000,
        method: 'UPI',
        idempotencyKey: 'wd-a',
        settings,
      }),
      withdrawals.requestWithdrawal({
        email: 'a@college.edu',
        amountPaise: 50000,
        method: 'UPI',
        idempotencyKey: 'wd-b',
        settings,
      }),
    ]);
    const ok = [one, two].filter((item) => item.status === 'fulfilled');
    const failed = [one, two].filter((item) => item.status === 'rejected');
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    assert.equal((await store.listWithdrawals('a@college.edu')).length, 1);
  });

  it('replays the same withdrawal idempotency key without a second reservation', async () => {
    const store = enabledStore();
    await store.insertCommission({
      referrerEmail: 'a@college.edu',
      referredEmail: 'b@college.edu',
      courseId: COURSE.id,
      providerOrderId: 'order_w2',
      commissionPaise: 50000,
      amountPaidPaise: 1490000,
      listPricePaise: 1490000,
      status: 'AVAILABLE',
      currency: 'INR',
    });
    await store.savePayoutAccount({
      email: 'a@college.edu',
      method: 'UPI',
      encryptedPayload: 'x',
      fingerprint: 'f1',
    });
    const withdrawals = createWithdrawalServices({ store, env: ENV });
    const settings = await store.getGlobalSettings();
    const first = await withdrawals.requestWithdrawal({
      email: 'a@college.edu',
      amountPaise: 20000,
      method: 'UPI',
      idempotencyKey: 'same-key',
      settings,
    });
    const second = await withdrawals.requestWithdrawal({
      email: 'a@college.edu',
      amountPaise: 20000,
      method: 'UPI',
      idempotencyKey: 'same-key',
      settings,
    });
    assert.equal(first.withdrawal.id, second.withdrawal.id);
    assert.equal(second.replayed, true);
    assert.equal((await store.listWithdrawals('a@college.edu')).length, 1);
  });
});

describe('referral authorization', () => {
  it('stops a student from reading another wallet', async () => {
    const store = enabledStore();
    const api = createHandlers({ env: ENV, store, fetch: async () => new Response('[]') });
    const denied = await api.referralMe({ headers: {} });
    assert.equal(denied.status, 401);
    const own = await api.referralMe(studentReq('a@college.edu'), { origin: 'https://evil.example' });
    assert.equal(own.status, 200);
    assert.equal(own.body.code, 'ALICE7K92');
    assert.equal(own.body.link, 'http://127.0.0.1:4174/r/ALICE7K92');
    assert.equal(String(own.body.link).includes('evil'), false);
    const other = await api.referralWithdraw(studentReq('b@college.edu'), { amountRupees: '500', method: 'UPI' });
    assert.notEqual(other.status, 200);
  });

  it('builds share links from the request host, not a query origin', async () => {
    const store = enabledStore();
    const api = createHandlers({ env: ENV, store, fetch: async () => new Response('[]') });
    const result = await api.referralMe(studentReq('a@college.edu'), { origin: 'https://evil.example' });
    assert.equal(result.status, 200);
    assert.equal(result.body.link, 'http://127.0.0.1:4174/r/ALICE7K92');
  });

  it('does not let a normal student approve a withdrawal', async () => {
    const store = enabledStore();
    const { createAdminHandlers } = await import('../lib/admin-handlers.mjs');
    const admin = createAdminHandlers({ env: ENV, store, fetch: async () => new Response('[]') });
    const result = await admin.updateWithdrawal(studentReq('a@college.edu'), { id: 'x', status: 'PAID' });
    assert.equal(result.status, 401);
  });
});

describe('ui regression', () => {
  it('does not rewrite homepage or course catalog copy', () => {
    const home = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.equal(home.includes('Refer & Earn'), false);
    assert.equal(home.includes('data-course-id="data-analytics"'), false);
    const course = readFileSync(path.join(ROOT, 'course.html'), 'utf8');
    assert.equal(course.includes('Referral Link'), false);
  });
});
