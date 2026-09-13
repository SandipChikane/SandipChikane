import { randomUUID } from 'node:crypto';
import { createSignedCookie, readCookieValue, readSignedCookie } from './access-auth.mjs';
import { calculateReferralCommission, snapshotCommission } from './commission.mjs';
import { computeBalances, proportionalReversePaise } from './ledger.mjs';
import { asNonNegativeInt } from './money.mjs';
import { firstNameOnly, generateReferralCode, hashIdentifier, isReferralCodeFormat, maskEmail, normalizeReferralCode } from './referral-privacy.mjs';
import { defaultProductReferralSettings, parseProductReferralSettings } from './referral-settings.mjs';

export const REFERRAL_COOKIE = 'gf_ref';

export function safeInternalPath(next) {
  const raw = String(next || '').trim();
  if (!raw) return '/#courses';
  if (!raw.startsWith('/')) return '/#courses';
  if (raw.startsWith('//') || raw.includes('\\') || raw.includes('://')) return '/#courses';
  const pathOnly = raw.split('?')[0].split('#')[0] || '/';
  const allowed = new Set(['/', '/index.html', '/dashboard.html', '/course.html', '/tpo.html']);
  if (!allowed.has(pathOnly)) return '/#courses';
  return raw;
}

export function createReferralServices({ store, env = {}, now = () => new Date() }) {
  if (!store) return null;

  async function globalSettings() {
    return store.getGlobalSettings();
  }

  async function ensureProfile(email, name = '') {
    const existing = await store.getProfile(email);
    if (existing?.code) return existing;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateReferralCode(name || email);
      const clash = await store.getProfileByCode(code);
      if (clash) continue;
      return store.upsertProfile({
        email,
        code,
        status: 'active',
        createdAt: now().toISOString(),
      });
    }
    const error = new Error('Could not allocate a referral code.');
    error.status = 500;
    throw error;
  }

  async function visitReferral(req, { code, next } = {}) {
    const settings = await globalSettings();
    const destination = safeInternalPath(next);
    const normalized = normalizeReferralCode(code);
    if (!settings.programEnabled || !isReferralCodeFormat(normalized)) {
      return redirectResult(destination);
    }
    const profile = await store.getProfileByCode(normalized);
    if (!profile || profile.status !== 'active') {
      return redirectResult(destination);
    }
    const visitor = readSignedCookie(req, 'gf_student', env)?.subject || '';
    if (visitor && visitor === profile.email) {
      return redirectResult(destination);
    }
    await store.recordClick({
      code: normalized,
      referrerEmail: profile.email,
      ipHash: hashIdentifier(secret(env), clientIp(req)),
      userAgentHash: hashIdentifier(secret(env), String(req?.headers?.['user-agent'] || '')),
    });
    const maxAgeMs = settings.attributionDays * 24 * 60 * 60 * 1000;
    let headers;
    try {
      headers = { 'Set-Cookie': createSignedCookie(REFERRAL_COOKIE, normalized, env, maxAgeMs).cookie };
    } catch {
      headers = undefined;
    }
    return redirectResult(destination, headers);
  }

  async function bindAttribution(req, email) {
    if (!email) return null;
    const existing = await store.getAttribution(email);
    if (existing) return { ...existing, alreadyLocked: true };
    const settings = await globalSettings();
    if (!settings.programEnabled) return null;
    const code = normalizeReferralCode(readSignedCookie(req, REFERRAL_COOKIE, env)?.subject || '');
    if (!code) return null;
    const profile = await store.getProfileByCode(code);
    if (!profile || profile.status !== 'active') return null;
    if (profile.email === email) {
      await store.addFlag({ userEmail: email, signal: 'self_referral', detail: { via: 'bind' } });
      return null;
    }
    const expiresAt = new Date(now().getTime() + settings.attributionDays * 24 * 60 * 60 * 1000).toISOString();
    const locked = await store.lockAttribution({
      referredEmail: email,
      referrerEmail: profile.email,
      code,
      expiresAt,
    });
    if (!locked?.alreadyLocked) {
      await store.addActivity({
        referrerEmail: profile.email,
        kind: 'registration',
        summary: 'A referred student created an account.',
      });
    }
    return locked;
  }

  async function awardForPaidOrder({
    req,
    buyerEmail,
    course,
    order,
    paymentId,
    eventId,
    buyerName = '',
  }) {
    if (!buyerEmail || !course?.id || !order?.id) {
      return { awarded: false, reason: 'incomplete_order' };
    }
    const existing = await store.getCommissionByOrder(order.id);
    if (existing) return { awarded: false, reason: 'already_commissioned', commission: existing };

    const eventKey = eventId || `checkout:${order.id}:${paymentId || ''}`;
    await bindAttribution(req, buyerEmail);
    const attribution = await store.getAttribution(buyerEmail);
    if (!attribution) return { awarded: false, reason: 'no_attribution' };
    if (attribution.expiresAt && Date.parse(attribution.expiresAt) < now().getTime()) {
      return { awarded: false, reason: 'attribution_expired' };
    }
    if (attribution.referrerEmail === buyerEmail) {
      await store.addFlag({ userEmail: buyerEmail, signal: 'self_referral', detail: { via: 'award' } });
      return { awarded: false, reason: 'self_referral' };
    }
    const referrer = await store.getProfile(attribution.referrerEmail);
    if (!referrer || referrer.status !== 'active') {
      return { awarded: false, reason: 'referrer_inactive' };
    }

    const [global, product] = await Promise.all([
      globalSettings(),
      store.getProductSettings(course.id),
    ]);
    const calc = calculateReferralCommission({
      order: { amount: asNonNegativeInt(order.amount), currency: order.currency || 'INR' },
      product: { price: course.price, id: course.id },
      pricing: {
        amountPaidPaise: asNonNegativeInt(order.amount),
        listPricePaise: asNonNegativeInt(course.price) * 100,
        currency: order.currency || 'INR',
      },
      referralSettings: { global, product },
      now: now(),
    });
    if (!calc.eligible) {
      await store.claimEvent('razorpay', eventKey);
      return { awarded: false, reason: calc.reason, calculation: calc };
    }

    const fraudHold = await shouldHoldCommission({
      referrerEmail: attribution.referrerEmail,
      referredEmail: buyerEmail,
      threshold: global.fraudReviewThreshold,
    });
    const availableAt = new Date(now().getTime() + calc.holdingDays * 24 * 60 * 60 * 1000).toISOString();
    const snapshot = snapshotCommission(calc, {
      courseId: course.id,
      referrerEmail: attribution.referrerEmail,
      referredEmail: buyerEmail,
      providerOrderId: order.id,
      providerPaymentId: paymentId || '',
      status: 'PENDING',
      fraudHold,
      reviewRequired: fraudHold,
      availableAt,
    });
    const commission = await store.insertCommission(snapshot);
    await store.claimEvent('razorpay', eventKey);
    await store.insertLedger({
      userEmail: attribution.referrerEmail,
      type: 'REFERRAL_COMMISSION',
      direction: 'credit',
      amountPaise: calc.commissionPaise,
      currency: calc.currency,
      status: 'posted',
      referenceType: 'commission',
      referenceId: commission.id,
      description: 'Referral commission pending verification hold',
      idempotencyKey: `commission:${order.id}`,
    });
    await store.addActivity({
      referrerEmail: attribution.referrerEmail,
      kind: 'purchase',
      summary: `A referred student purchased ${course.name || 'a course'}.`,
    });
    return { awarded: true, commission, calculation: calc };
  }

  async function shouldHoldCommission({ referrerEmail, referredEmail, threshold }) {
    const [referrerPayout, buyerPayout] = await Promise.all([
      store.getPayoutAccount(referrerEmail),
      store.getPayoutAccount(referredEmail),
    ]);
    if (referrerPayout?.fingerprint && buyerPayout?.fingerprint && referrerPayout.fingerprint === buyerPayout.fingerprint) {
      await store.addFlag({
        userEmail: referrerEmail,
        relatedEmail: referredEmail,
        signal: 'shared_payout',
        detail: { method: referrerPayout.method },
      });
      return true;
    }
    const flags = (await store.listFlags()).filter((row) => row.userEmail === referrerEmail && row.open);
    return flags.length >= threshold;
  }

  async function matureDue() {
    const rows = await store.listCommissions();
    const matured = [];
    for (const row of rows) {
      if (row.status !== 'PENDING' || row.fraudHold || row.reviewRequired) continue;
      if (row.availableAt && Date.parse(row.availableAt) > now().getTime()) continue;
      const updated = await store.updateCommission(row.id, { status: 'AVAILABLE' });
      await store.insertLedger({
        userEmail: row.referrerEmail,
        type: 'REFERRAL_COMMISSION',
        direction: 'credit',
        amountPaise: 0,
        currency: row.currency,
        status: 'posted',
        referenceType: 'commission',
        referenceId: row.id,
        description: 'Commission holding period completed',
        idempotencyKey: `mature:${row.id}`,
      });
      matured.push(updated);
    }
    return { matured: matured.length };
  }

  async function reverseCommission(commission, {
    reason = 'refund',
    amountPaise,
    reviewIfPaid = true,
  } = {}) {
    if (!commission || commission.status === 'REVERSED') {
      return { reversed: false, reason: 'already_reversed' };
    }
    if (commission.status === 'PAID' || commission.status === 'WITHDRAWAL_PENDING') {
      const updated = await store.updateCommission(commission.id, {
        reviewRequired: true,
        fraudHold: true,
      });
      await store.insertLedger({
        userEmail: commission.referrerEmail,
        type: 'REFUND_REVERSAL',
        direction: 'debit',
        amountPaise: 0,
        currency: commission.currency,
        status: 'posted',
        referenceType: 'commission',
        referenceId: commission.id,
        description: `${reason}: paid or reserved commission flagged for review`,
        idempotencyKey: `review:${commission.id}:${reason}`,
      });
      return { reversed: false, reviewRequired: reviewIfPaid, commission: updated };
    }
    const reverseAmount = amountPaise == null ? commission.commissionPaise : asNonNegativeInt(amountPaise);
    const updated = await store.updateCommission(commission.id, {
      status: 'REVERSED',
      reversedAt: now().toISOString(),
    });
    await store.insertLedger({
      userEmail: commission.referrerEmail,
      type: reason === 'chargeback' ? 'CHARGEBACK_REVERSAL' : 'COMMISSION_REVERSAL',
      direction: 'debit',
      amountPaise: reverseAmount,
      currency: commission.currency,
      status: 'posted',
      referenceType: 'commission',
      referenceId: commission.id,
      description: `${reason}: commission reversed`,
      idempotencyKey: `reverse:${commission.id}:${reason}`,
    });
    return { reversed: true, commission: updated };
  }

  async function applyRefund({ providerOrderId, providerPaymentId, refundedPaise, full = false }) {
    const commission = (providerOrderId && await store.getCommissionByOrder(providerOrderId))
      || (providerPaymentId && await store.getCommissionByPayment(providerPaymentId));
    if (!commission) return { reversed: false, reason: 'no_commission' };
    const settings = await globalSettings();
    if (full || settings.partialRefundPolicy === 'FULL_REVERSAL') {
      return reverseCommission(commission, { reason: 'refund' });
    }
    if (settings.partialRefundPolicy === 'THRESHOLD') {
      const remaining = Math.max(0, commission.amountPaidPaise - asNonNegativeInt(refundedPaise));
      const product = await store.getProductSettings(commission.courseId);
      const minOrder = parseProductReferralSettings(product).minOrderValuePaise;
      if (minOrder && remaining < minOrder) {
        return reverseCommission(commission, { reason: 'refund' });
      }
    }
    const portion = proportionalReversePaise(commission.commissionPaise, refundedPaise, commission.amountPaidPaise);
    if (portion >= commission.commissionPaise) {
      return reverseCommission(commission, { reason: 'refund' });
    }
    await store.insertLedger({
      userEmail: commission.referrerEmail,
      type: 'REFUND_REVERSAL',
      direction: 'debit',
      amountPaise: portion,
      currency: commission.currency,
      status: 'posted',
      referenceType: 'commission',
      referenceId: commission.id,
      description: 'Partial refund proportional reversal',
      idempotencyKey: `partial:${commission.id}:${refundedPaise}`,
    });
    return { reversed: true, partial: true, amountPaise: portion, commission };
  }

  async function applyDispute({ providerOrderId, providerPaymentId, outcome }) {
    const commission = (providerOrderId && await store.getCommissionByOrder(providerOrderId))
      || (providerPaymentId && await store.getCommissionByPayment(providerPaymentId));
    if (!commission) return { ok: false, reason: 'no_commission' };
    const settings = await globalSettings();
    if (outcome === 'created' || outcome === 'DISPUTED') {
      const updated = await store.updateCommission(commission.id, { fraudHold: true, reviewRequired: true });
      await store.insertLedger({
        userEmail: commission.referrerEmail,
        type: 'CHARGEBACK_HOLD',
        direction: 'debit',
        amountPaise: 0,
        currency: commission.currency,
        status: 'posted',
        referenceType: 'commission',
        referenceId: commission.id,
        description: 'Payment dispute opened; commission frozen',
        idempotencyKey: `dispute-hold:${commission.id}`,
      });
      return { ok: true, commission: updated };
    }
    if (outcome === 'lost' || outcome === 'LOST' || settings.chargebackPolicy === 'REVERSE_ON_LOST' && outcome === 'LOST') {
      return reverseCommission(commission, { reason: 'chargeback' });
    }
    if (outcome === 'won' || outcome === 'WON') {
      return { ok: true, commission: await store.updateCommission(commission.id, { fraudHold: false }) };
    }
    return { ok: true, commission };
  }

  async function dashboardFor(email, { origin = '' } = {}) {
    const settings = await globalSettings();
    const profile = await ensureProfile(email);
    const [commissions, withdrawals, attributions, clicks, activity] = await Promise.all([
      store.listCommissionsByReferrer(email),
      store.listWithdrawals(email),
      store.listAttributionsByReferrer(email),
      store.countClicks(email),
      store.listActivity(email, 8),
    ]);
    const successful = commissions.filter((row) => row.status !== 'REVERSED' && row.status !== 'REJECTED');
    const balances = computeBalances({ commissions, withdrawals });
    const link = `${trimOrigin(origin)}/r/${profile.code}`;
    return {
      enabled: settings.programEnabled,
      termsVersion: settings.termsVersion,
      acceptedTerms: profile.termsVersion === settings.termsVersion,
      code: profile.code,
      link,
      clicks,
      registrations: attributions.length,
      successfulReferrals: successful.length,
      balances,
      activity: activity.map((row) => ({
        kind: row.kind,
        summary: row.summary,
        createdAt: row.createdAt,
      })),
      recent: successful.slice(0, 8).map((row) => ({
        id: row.id,
        status: row.status,
        courseId: row.courseId,
        amountPaise: row.commissionPaise,
        createdAt: row.createdAt,
        referred: firstNameOnly('', row.referredEmail),
        referredMasked: maskEmail(row.referredEmail),
      })),
      disclosure: 'Refer a friend and earn a referral reward when they successfully purchase an eligible course through your referral link. Referral rewards are subject to eligibility, payment verification, refund checks, fraud checks and referral program terms. Earnings are not guaranteed.',
      withdrawalEnabled: settings.withdrawalEnabled,
      minWithdrawalPaise: settings.minWithdrawalPaise,
      maxWithdrawalPaise: settings.maxWithdrawalPaise,
      methods: settings.supportedPayoutMethods,
    };
  }

  async function acceptTerms(email) {
    const settings = await globalSettings();
    const profile = await ensureProfile(email);
    return store.upsertProfile({
      ...profile,
      termsVersion: settings.termsVersion,
      termsAcceptedAt: now().toISOString(),
    });
  }

  async function adminOverview() {
    const [commissions, withdrawals, flags, settings] = await Promise.all([
      store.listCommissions(),
      store.listWithdrawals(),
      store.listFlags(),
      globalSettings(),
    ]);
    const balances = computeBalances({ commissions, withdrawals });
    const successful = commissions.filter((row) => row.status !== 'REVERSED' && row.status !== 'REJECTED');
    const byReferrer = new Map();
    for (const row of successful) {
      const current = byReferrer.get(row.referrerEmail) || { email: maskEmail(row.referrerEmail), count: 0, amountPaise: 0 };
      current.count += 1;
      current.amountPaise += row.commissionPaise;
      byReferrer.set(row.referrerEmail, current);
    }
    return {
      settings,
      totals: {
        referralSales: successful.length,
        referralRevenuePaise: successful.reduce((sum, row) => sum + row.amountPaidPaise, 0),
        ...balances,
        successfulReferrals: successful.length,
        conversionRate: 0,
        openFlags: flags.filter((row) => row.open).length,
      },
      topReferrers: [...byReferrer.values()].sort((a, b) => b.amountPaise - a.amountPaise).slice(0, 10),
      commissions: commissions.slice(0, 80).map(adminCommission),
      withdrawals: withdrawals.slice(0, 80).map(adminWithdrawal),
      flags: flags.slice(0, 40),
    };
  }

  return {
    store,
    ensureProfile,
    visitReferral,
    bindAttribution,
    awardForPaidOrder,
    matureDue,
    applyRefund,
    applyDispute,
    reverseCommission,
    dashboardFor,
    acceptTerms,
    adminOverview,
    globalSettings,
    async productSettings(courseId) {
      return store.getProductSettings(courseId);
    },
    async saveProductSettings(courseId, input) {
      return store.saveProductSettings(courseId, input);
    },
    async saveGlobalSettings(input) {
      return store.saveGlobalSettings(input);
    },
    async getCommission(id) {
      return store.getCommission(id);
    },
    async getCommissionByPayment(paymentId) {
      return store.getCommissionByPayment(paymentId);
    },
    async getCommissionByOrder(orderId) {
      return store.getCommissionByOrder(orderId);
    },
    async listCommissions() {
      return store.listCommissions();
    },
    async getWithdrawal(id) {
      return store.getWithdrawal(id);
    },
    async listWithdrawals(email) {
      return store.listWithdrawals(email);
    },
    cookieCode(req) {
      return normalizeReferralCode(readSignedCookie(req, REFERRAL_COOKIE, env)?.subject || readCookieValue(req?.headers?.cookie, REFERRAL_COOKIE));
    },
  };
}

function redirectResult(location, headers) {
  return {
    status: 302,
    redirect: location,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...(headers || {}),
    },
    body: { redirect: location },
  };
}

function clientIp(req) {
  return String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '').split(',')[0].trim();
}

function secret(env) {
  return String(env.ADMIN_SESSION_SECRET || env.REFERRAL_PAYOUT_KEY || 'gradflow');
}

function trimOrigin(origin) {
  return String(origin || '').replace(/\/+$/, '');
}

function adminCommission(row) {
  return {
    id: row.id,
    referrer: maskEmail(row.referrerEmail),
    referred: maskEmail(row.referredEmail),
    courseId: row.courseId,
    status: row.status,
    amountPaise: row.commissionPaise,
    amountPaidPaise: row.amountPaidPaise,
    listPricePaise: row.listPricePaise,
    commissionType: row.commissionType,
    ruleVersion: row.ruleVersion,
    providerOrderId: row.providerOrderId,
    fraudHold: row.fraudHold,
    reviewRequired: row.reviewRequired,
    createdAt: row.createdAt,
  };
}

function adminWithdrawal(row) {
  return {
    id: row.id,
    user: maskEmail(row.userEmail),
    amountPaise: row.amountPaise,
    method: row.method,
    status: row.status,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
  };
}

export { defaultProductReferralSettings, parseProductReferralSettings };
