import { readSignedCookie } from './access-auth.mjs';
import { csrfOk } from './csrf.mjs';
import { isValidEmail, normalizeEmail } from './http.mjs';
import { asNonNegativeInt, rupeesToPaise } from './money.mjs';
import { createRateLimiter, clientKey } from './rate-limit.mjs';
import { createReferralServices } from './referral.mjs';
import { createMemoryReferralStore, createSupabaseReferralStore } from './referral-store.mjs';
import { flattenReferralSettings, normalizeReferralSettingsForm, parseProductReferralSettings } from './referral-settings.mjs';
import { createWithdrawalServices } from './withdrawals.mjs';

const STUDENT_COOKIE = 'gf_student';
const clickLimit = createRateLimiter({ windowMs: 60_000, max: 30 });
const withdrawLimit = createRateLimiter({ windowMs: 10 * 60_000, max: 8 });
const payoutLimit = createRateLimiter({ windowMs: 10 * 60_000, max: 8 });

export function buildReferralStack({ env = {}, supabase, store, now } = {}) {
  const resolvedStore = store || (supabase?.request
    ? createSupabaseReferralStore({ request: supabase.request.bind(supabase), env })
    : createMemoryReferralStore());
  const referral = createReferralServices({ store: resolvedStore, env, now });
  const withdrawals = createWithdrawalServices({ store: resolvedStore, env, now });
  return { store: resolvedStore, referral, withdrawals };
}

export function createReferralHandlers({ referral, withdrawals, env = {} }) {
  function requireStudent(req) {
    const email = normalizeEmail(readSignedCookie(req, STUDENT_COOKIE, env)?.subject);
    if (!isValidEmail(email)) {
      return { error: { status: 401, body: { error: 'Student session required.' } } };
    }
    return { email };
  }

  function requireCsrf(req) {
    if (!csrfOk(req)) {
      return { status: 403, body: { error: 'This request could not be verified.' } };
    }
    return null;
  }

  return {
    async visit(req, query = {}) {
      if (!clickLimit(clientKey(req, 'ref'))) {
        return { status: 429, body: { error: 'Too many referral visits. Try again shortly.' } };
      }
      return referral.visitReferral(req, { code: query.code, next: query.next });
    },

    async me(req, query = {}) {
      const gate = requireStudent(req);
      if (gate.error) return gate.error;
      const origin = requestOrigin(req);
      try {
        const dashboard = await referral.dashboardFor(gate.email, { origin });
        const payout = await withdrawals.publicPayout(gate.email);
        return { status: 200, body: { ...dashboard, payout } };
      } catch (error) {
        const message = String(error.message || '');
        if (Number(error.status) === 404 || message.includes('does not exist') || message.includes('schema cache')) {
          return { status: 200, body: { enabled: false } };
        }
        throw error;
      }
    },

    async acceptTerms(req) {
      const blocked = requireCsrf(req);
      if (blocked) return blocked;
      const gate = requireStudent(req);
      if (gate.error) return gate.error;
      await referral.acceptTerms(gate.email);
      return { status: 200, body: { ok: true } };
    },

    async payout(req, body = {}, method = 'GET') {
      const gate = requireStudent(req);
      if (gate.error) return gate.error;
      if (method === 'GET') {
        return { status: 200, body: { payout: await withdrawals.publicPayout(gate.email) } };
      }
      const blocked = requireCsrf(req);
      if (blocked) return blocked;
      if (!payoutLimit(clientKey(req, `payout:${gate.email}`))) {
        return { status: 429, body: { error: 'Too many payout updates. Try again later.' } };
      }
      await withdrawals.savePayout({
        email: gate.email,
        method: String(body.method || '').toUpperCase(),
        details: {
          upiId: body.upiId,
          accountNumber: body.accountNumber,
          ifsc: body.ifsc,
          holderName: body.holderName,
        },
      });
      return { status: 200, body: { payout: await withdrawals.publicPayout(gate.email) } };
    },

    async withdraw(req, body = {}) {
      const blocked = requireCsrf(req);
      if (blocked) return blocked;
      const gate = requireStudent(req);
      if (gate.error) return gate.error;
      if (!withdrawLimit(clientKey(req, `wd:${gate.email}`))) {
        return { status: 429, body: { error: 'Too many withdrawal requests. Try again later.' } };
      }
      const settings = await referral.globalSettings();
      const amountPaise = body.amountPaise != null
        ? asNonNegativeInt(body.amountPaise)
        : rupeesToPaise(body.amountRupees);
      try {
        const result = await withdrawals.requestWithdrawal({
          email: gate.email,
          amountPaise,
          method: String(body.method || '').toUpperCase(),
          idempotencyKey: String(body.idempotencyKey || req?.headers?.['idempotency-key'] || '').trim() || null,
          settings,
        });
        return { status: 200, body: { ok: true, withdrawal: result.withdrawal, replayed: result.replayed } };
      } catch (error) {
        return { status: error.status || 400, body: { error: error.message || 'Withdrawal failed.' } };
      }
    },

    async myWithdrawals(req) {
      const gate = requireStudent(req);
      if (gate.error) return gate.error;
      const rows = await referral.listWithdrawals(gate.email);
      return {
        status: 200,
        body: {
          withdrawals: rows.map((row) => ({
            id: row.id,
            amountPaise: row.amountPaise,
            method: row.method,
            status: row.status,
            createdAt: row.createdAt,
          })),
        },
      };
    },

    async mature(req, body = {}) {
      const cron = String(env.REFERRAL_CRON_SECRET || '').trim();
      const provided = String(req?.headers?.['x-cron-secret'] || body.secret || '').trim();
      if (cron) {
        if (provided !== cron) return { status: 401, body: { error: 'Unauthorized.' } };
      }
      return { status: 200, body: await referral.matureDue() };
    },
  };
}

export function studentOwns(email, recordEmail) {
  return normalizeEmail(email) && normalizeEmail(email) === normalizeEmail(recordEmail);
}

function requestOrigin(req) {
  const host = String(req?.headers?.host || '').trim();
  if (!host) return '';
  const forwarded = String(req?.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const proto = forwarded === 'https' || forwarded === 'http'
    ? forwarded
    : (String(req?.headers?.origin || '').startsWith('https://') ? 'https' : 'http');
  return `${proto}://${host}`;
}

export { flattenReferralSettings, normalizeReferralSettingsForm, parseProductReferralSettings };
