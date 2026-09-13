import { randomUUID } from 'node:crypto';
import { defaultProductReferralSettings, parseGlobalReferralSettings, parseProductReferralSettings, readStoredReferralSettings } from './referral-settings.mjs';

export const COMMISSION_STATUSES = ['PENDING', 'AVAILABLE', 'WITHDRAWAL_PENDING', 'PAID', 'REVERSED', 'REJECTED'];
export const WITHDRAWAL_STATUSES = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED', 'CANCELLED'];
export const LEDGER_TYPES = [
  'REFERRAL_COMMISSION',
  'COMMISSION_REVERSAL',
  'WITHDRAWAL_REQUEST',
  'WITHDRAWAL_RESERVED',
  'WITHDRAWAL_COMPLETED',
  'WITHDRAWAL_RELEASED',
  'WITHDRAWAL_REJECTED',
  'REFUND_REVERSAL',
  'ADMIN_ADJUSTMENT',
  'CHARGEBACK_HOLD',
  'CHARGEBACK_REVERSAL',
];

export function createMemoryReferralStore(seed = {}) {
  const state = {
    settings: parseGlobalReferralSettings(seed.settings || {}),
    profiles: new Map(),
    clicks: [],
    attributions: new Map(),
    products: new Map(),
    commissions: [],
    ledger: [],
    withdrawals: [],
    payouts: new Map(),
    flags: [],
    events: new Set(),
    activity: [],
    locks: new Map(),
  };
  for (const profile of seed.profiles || []) {
    state.profiles.set(profile.email, { ...profile });
  }
  for (const row of seed.attributions || []) {
    state.attributions.set(row.referredEmail, { ...row });
  }
  for (const [courseId, row] of Object.entries(seed.products || {})) {
    state.products.set(courseId, parseProductReferralSettings(row));
  }
  for (const row of seed.commissions || []) state.commissions.push({ ...row });
  for (const row of seed.ledger || []) state.ledger.push({ ...row });
  for (const row of seed.withdrawals || []) state.withdrawals.push({ ...row });

  return {
    kind: 'memory',
    async getGlobalSettings() {
      return { ...state.settings };
    },
    async saveGlobalSettings(next) {
      state.settings = parseGlobalReferralSettings(next);
      return { ...state.settings };
    },
    async getProductSettings(courseId) {
      return parseProductReferralSettings(state.products.get(courseId) || defaultProductReferralSettings());
    },
    async saveProductSettings(courseId, next) {
      const saved = parseProductReferralSettings(next);
      state.products.set(courseId, saved);
      return saved;
    },
    async getProfile(email) {
      return state.profiles.get(email) || null;
    },
    async getProfileByCode(code) {
      return [...state.profiles.values()].find((row) => row.code === code) || null;
    },
    async upsertProfile(profile) {
      const existing = state.profiles.get(profile.email);
      const saved = { ...existing, ...profile };
      state.profiles.set(profile.email, saved);
      return saved;
    },
    async recordClick(row) {
      const saved = { id: randomUUID(), createdAt: new Date().toISOString(), ...row };
      state.clicks.push(saved);
      return saved;
    },
    async listClicks(code) {
      return state.clicks.filter((row) => row.code === code);
    },
    async countClicks(referrerEmail) {
      return state.clicks.filter((row) => row.referrerEmail === referrerEmail).length;
    },
    async getAttribution(email) {
      return state.attributions.get(email) || null;
    },
    async lockAttribution(row) {
      const existing = state.attributions.get(row.referredEmail);
      if (existing) return { ...existing, alreadyLocked: true };
      const saved = {
        id: randomUUID(),
        locked: true,
        attributedAt: new Date().toISOString(),
        ...row,
      };
      state.attributions.set(row.referredEmail, saved);
      return saved;
    },
    async listAttributionsByReferrer(email) {
      return [...state.attributions.values()].filter((row) => row.referrerEmail === email);
    },
    async claimEvent(provider, eventId) {
      const key = `${provider}:${eventId}`;
      if (state.events.has(key)) return { inserted: false, eventId };
      state.events.add(key);
      return { inserted: true, eventId };
    },
    async insertCommission(row) {
      if (state.commissions.some((item) => item.providerOrderId === row.providerOrderId)) {
        return state.commissions.find((item) => item.providerOrderId === row.providerOrderId);
      }
      const saved = { id: row.id || randomUUID(), createdAt: new Date().toISOString(), ...row };
      state.commissions.push(saved);
      return saved;
    },
    async getCommissionByOrder(providerOrderId) {
      return state.commissions.find((row) => row.providerOrderId === providerOrderId) || null;
    },
    async getCommissionByPayment(providerPaymentId) {
      return state.commissions.find((row) => row.providerPaymentId === providerPaymentId) || null;
    },
    async getCommission(id) {
      return state.commissions.find((row) => row.id === id) || null;
    },
    async listCommissionsByReferrer(email) {
      return state.commissions.filter((row) => row.referrerEmail === email);
    },
    async listCommissions() {
      return [...state.commissions];
    },
    async updateCommission(id, patch) {
      const row = state.commissions.find((item) => item.id === id);
      if (!row) return null;
      Object.assign(row, patch, { updatedAt: new Date().toISOString() });
      return { ...row };
    },
    async insertLedger(row) {
      if (row.idempotencyKey && state.ledger.some((item) => item.idempotencyKey === row.idempotencyKey)) {
        return state.ledger.find((item) => item.idempotencyKey === row.idempotencyKey);
      }
      const saved = { id: row.id || randomUUID(), createdAt: new Date().toISOString(), ...row };
      state.ledger.push(saved);
      return saved;
    },
    async listLedger(email) {
      return state.ledger.filter((row) => row.userEmail === email);
    },
    async listAllLedger() {
      return [...state.ledger];
    },
    async insertWithdrawal(row) {
      if (row.idempotencyKey && state.withdrawals.some((item) => item.idempotencyKey === row.idempotencyKey)) {
        return state.withdrawals.find((item) => item.idempotencyKey === row.idempotencyKey);
      }
      const saved = { id: row.id || randomUUID(), createdAt: new Date().toISOString(), ...row };
      state.withdrawals.push(saved);
      return saved;
    },
    async getWithdrawal(id) {
      return state.withdrawals.find((row) => row.id === id) || null;
    },
    async listWithdrawals(email) {
      return email
        ? state.withdrawals.filter((row) => row.userEmail === email)
        : [...state.withdrawals];
    },
    async updateWithdrawal(id, patch) {
      const row = state.withdrawals.find((item) => item.id === id);
      if (!row) return null;
      Object.assign(row, patch, { updatedAt: new Date().toISOString() });
      return { ...row };
    },
    async getPayoutAccount(email) {
      return state.payouts.get(email) || null;
    },
    async savePayoutAccount(row) {
      state.payouts.set(row.email, { ...row, updatedAt: new Date().toISOString() });
      return state.payouts.get(row.email);
    },
    async listPayoutByFingerprint(fingerprint, exceptEmail) {
      return [...state.payouts.values()].filter((row) => row.fingerprint === fingerprint && row.email !== exceptEmail);
    },
    async addFlag(row) {
      const saved = { id: randomUUID(), createdAt: new Date().toISOString(), open: true, ...row };
      state.flags.push(saved);
      return saved;
    },
    async listFlags() {
      return [...state.flags];
    },
    async addActivity(row) {
      const saved = { id: randomUUID(), createdAt: new Date().toISOString(), ...row };
      state.activity.push(saved);
      return saved;
    },
    async listActivity(email, limit = 20) {
      return state.activity.filter((row) => row.referrerEmail === email).slice(-limit).reverse();
    },
    async withUserLock(email, fn) {
      const prev = state.locks.get(email) || Promise.resolve();
      let release;
      const next = new Promise((resolve) => {
        release = resolve;
      });
      state.locks.set(email, prev.then(() => next));
      await prev;
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

export function createSupabaseReferralStore({ request, env = {} }) {
  async function safe(fn, fallback) {
    try {
      return await fn();
    } catch (error) {
      if (isMissing(error)) return fallback;
      throw error;
    }
  }

  return {
    kind: 'supabase',
    async getGlobalSettings() {
      const rows = await safe(() => request('site_settings?select=key,value'), []);
      const map = Object.fromEntries((rows || []).map((row) => [row.key, unwrap(row.value)]));
      return readStoredReferralSettings(map);
    },
    async saveGlobalSettings(next) {
      const parsed = parseGlobalReferralSettings(next);
      await request('site_settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: { key: 'referral', value: parsed, updated_at: new Date().toISOString() },
      });
      return parsed;
    },
    async getProductSettings(courseId) {
      const rows = await safe(
        () => request(`course_referral_settings?course_id=eq.${encodeURIComponent(courseId)}&select=*&limit=1`),
        [],
      );
      return parseProductReferralSettings(fromProductRow(rows?.[0]));
    },
    async saveProductSettings(courseId, next) {
      const parsed = parseProductReferralSettings(next);
      await request('course_referral_settings?on_conflict=course_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: toProductRow(courseId, parsed),
      });
      return parsed;
    },
    async getProfile(email) {
      const rows = await safe(
        () => request(`referral_profiles?email=eq.${encodeURIComponent(email)}&select=*&limit=1`),
        [],
      );
      return rows?.[0] ? fromProfile(rows[0]) : null;
    },
    async getProfileByCode(code) {
      const rows = await safe(
        () => request(`referral_profiles?code=eq.${encodeURIComponent(code)}&select=*&limit=1`),
        [],
      );
      return rows?.[0] ? fromProfile(rows[0]) : null;
    },
    async upsertProfile(profile) {
      const rows = await request('referral_profiles?on_conflict=email', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: toProfile(profile),
      });
      const saved = Array.isArray(rows) ? rows[0] : rows;
      return fromProfile(saved);
    },
    async recordClick(row) {
      const rows = await request('referral_clicks', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: {
          code: row.code,
          referrer_email: row.referrerEmail,
          ip_hash: row.ipHash || null,
          user_agent_hash: row.userAgentHash || null,
        },
      });
      return Array.isArray(rows) ? rows[0] : rows;
    },
    async countClicks(referrerEmail) {
      const rows = await safe(
        () => request(`referral_clicks?referrer_email=eq.${encodeURIComponent(referrerEmail)}&select=id`),
        [],
      );
      return (rows || []).length;
    },
    async getAttribution(email) {
      const rows = await safe(
        () => request(`referral_attributions?referred_email=eq.${encodeURIComponent(email)}&select=*&limit=1`),
        [],
      );
      return rows?.[0] ? fromAttribution(rows[0]) : null;
    },
    async lockAttribution(row) {
      const existing = await this.getAttribution(row.referredEmail);
      if (existing) return { ...existing, alreadyLocked: true };
      try {
        const rows = await request('referral_attributions', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: {
            referred_email: row.referredEmail,
            referrer_email: row.referrerEmail,
            code: row.code,
            expires_at: row.expiresAt,
            locked: true,
          },
        });
        const saved = Array.isArray(rows) ? rows[0] : rows;
        return fromAttribution(saved);
      } catch (error) {
        if (String(error.message || '').includes('duplicate') || Number(error.status) === 409) {
          return { ...(await this.getAttribution(row.referredEmail)), alreadyLocked: true };
        }
        throw error;
      }
    },
    async listAttributionsByReferrer(email) {
      const rows = await safe(
        () => request(`referral_attributions?referrer_email=eq.${encodeURIComponent(email)}&select=*&order=attributed_at.desc`),
        [],
      );
      return (rows || []).map(fromAttribution);
    },
    async claimEvent(provider, eventId) {
      try {
        await request('payment_provider_events', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: { provider, event_id: eventId },
        });
        return { inserted: true, eventId };
      } catch (error) {
        if (Number(error.status) === 409 || String(error.message || '').toLowerCase().includes('duplicate')) {
          return { inserted: false, eventId };
        }
        if (isMissing(error)) return { inserted: true, eventId };
        throw error;
      }
    },
    async insertCommission(row) {
      try {
        const rows = await request('referral_commissions', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: toCommission(row),
        });
        return fromCommission(Array.isArray(rows) ? rows[0] : rows);
      } catch (error) {
        if (Number(error.status) === 409 || String(error.message || '').toLowerCase().includes('duplicate')) {
          return this.getCommissionByOrder(row.providerOrderId);
        }
        throw error;
      }
    },
    async getCommissionByOrder(providerOrderId) {
      const rows = await safe(
        () => request(`referral_commissions?provider_order_id=eq.${encodeURIComponent(providerOrderId)}&select=*&limit=1`),
        [],
      );
      return rows?.[0] ? fromCommission(rows[0]) : null;
    },
    async getCommissionByPayment(providerPaymentId) {
      if (!providerPaymentId) return null;
      const rows = await safe(
        () => request(`referral_commissions?provider_payment_id=eq.${encodeURIComponent(providerPaymentId)}&select=*&limit=1`),
        [],
      );
      return rows?.[0] ? fromCommission(rows[0]) : null;
    },
    async getCommission(id) {
      const rows = await safe(
        () => request(`referral_commissions?id=eq.${encodeURIComponent(id)}&select=*&limit=1`),
        [],
      );
      return rows?.[0] ? fromCommission(rows[0]) : null;
    },
    async listCommissionsByReferrer(email) {
      const rows = await safe(
        () => request(`referral_commissions?referrer_email=eq.${encodeURIComponent(email)}&select=*&order=created_at.desc`),
        [],
      );
      return (rows || []).map(fromCommission);
    },
    async listCommissions() {
      const rows = await safe(
        () => request('referral_commissions?select=*&order=created_at.desc&limit=200'),
        [],
      );
      return (rows || []).map(fromCommission);
    },
    async updateCommission(id, patch) {
      const rows = await request(`referral_commissions?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: {
          status: patch.status,
          fraud_hold: patch.fraudHold,
          review_required: patch.reviewRequired,
          available_at: patch.availableAt,
          reversed_at: patch.reversedAt,
          updated_at: new Date().toISOString(),
        },
      });
      return fromCommission(Array.isArray(rows) ? rows[0] : rows);
    },
    async insertLedger(row) {
      try {
        const rows = await request('referral_ledger', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: toLedger(row),
        });
        return fromLedger(Array.isArray(rows) ? rows[0] : rows);
      } catch (error) {
        if (Number(error.status) === 409 || String(error.message || '').toLowerCase().includes('duplicate')) {
          const existing = await request(`referral_ledger?idempotency_key=eq.${encodeURIComponent(row.idempotencyKey)}&select=*&limit=1`);
          return existing?.[0] ? fromLedger(existing[0]) : null;
        }
        throw error;
      }
    },
    async listLedger(email) {
      const rows = await safe(
        () => request(`referral_ledger?user_email=eq.${encodeURIComponent(email)}&select=*&order=created_at.desc&limit=200`),
        [],
      );
      return (rows || []).map(fromLedger);
    },
    async listAllLedger() {
      const rows = await safe(
        () => request('referral_ledger?select=*&order=created_at.desc&limit=300'),
        [],
      );
      return (rows || []).map(fromLedger);
    },
    async insertWithdrawal(row) {
      try {
        const rows = await request('referral_withdrawals', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: toWithdrawal(row),
        });
        return fromWithdrawal(Array.isArray(rows) ? rows[0] : rows);
      } catch (error) {
        if (row.idempotencyKey && (Number(error.status) === 409 || String(error.message || '').includes('duplicate'))) {
          const existing = await request(`referral_withdrawals?idempotency_key=eq.${encodeURIComponent(row.idempotencyKey)}&select=*&limit=1`);
          return existing?.[0] ? fromWithdrawal(existing[0]) : null;
        }
        throw error;
      }
    },
    async getWithdrawal(id) {
      const rows = await safe(
        () => request(`referral_withdrawals?id=eq.${encodeURIComponent(id)}&select=*&limit=1`),
        [],
      );
      return rows?.[0] ? fromWithdrawal(rows[0]) : null;
    },
    async listWithdrawals(email) {
      const filter = email ? `user_email=eq.${encodeURIComponent(email)}&` : '';
      const rows = await safe(
        () => request(`referral_withdrawals?${filter}select=*&order=created_at.desc&limit=200`),
        [],
      );
      return (rows || []).map(fromWithdrawal);
    },
    async updateWithdrawal(id, patch) {
      const rows = await request(`referral_withdrawals?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: {
          status: patch.status,
          admin_note: patch.adminNote,
          paid_at: patch.paidAt,
          updated_at: new Date().toISOString(),
        },
      });
      return fromWithdrawal(Array.isArray(rows) ? rows[0] : rows);
    },
    async getPayoutAccount(email) {
      const rows = await safe(
        () => request(`referral_payout_accounts?email=eq.${encodeURIComponent(email)}&select=*&limit=1`),
        [],
      );
      return rows?.[0] ? fromPayout(rows[0]) : null;
    },
    async savePayoutAccount(row) {
      const rows = await request('referral_payout_accounts?on_conflict=email', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: {
          email: row.email,
          method: row.method,
          encrypted_payload: row.encryptedPayload,
          fingerprint: row.fingerprint,
          updated_at: new Date().toISOString(),
        },
      });
      return fromPayout(Array.isArray(rows) ? rows[0] : rows);
    },
    async listPayoutByFingerprint(fingerprint, exceptEmail) {
      const rows = await safe(
        () => request(`referral_payout_accounts?fingerprint=eq.${encodeURIComponent(fingerprint)}&select=email,method,fingerprint`),
        [],
      );
      return (rows || []).filter((row) => row.email !== exceptEmail).map(fromPayout);
    },
    async addFlag(row) {
      const rows = await request('referral_fraud_flags', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: {
          user_email: row.userEmail,
          related_email: row.relatedEmail || null,
          signal: row.signal,
          detail: row.detail || {},
          open: true,
        },
      });
      return Array.isArray(rows) ? rows[0] : rows;
    },
    async listFlags() {
      const rows = await safe(
        () => request('referral_fraud_flags?select=*&order=created_at.desc&limit=100'),
        [],
      );
      return (rows || []).map((row) => ({
        id: row.id,
        userEmail: row.user_email,
        relatedEmail: row.related_email,
        signal: row.signal,
        detail: row.detail || {},
        open: row.open,
        createdAt: row.created_at,
      }));
    },
    async addActivity(row) {
      await safe(() => request('referral_activity', {
        method: 'POST',
        body: {
          referrer_email: row.referrerEmail,
          kind: row.kind,
          summary: row.summary,
        },
      }), null);
    },
    async listActivity(email, limit = 20) {
      const rows = await safe(
        () => request(`referral_activity?referrer_email=eq.${encodeURIComponent(email)}&select=*&order=created_at.desc&limit=${Number(limit) || 20}`),
        [],
      );
      return (rows || []).map((row) => ({
        id: row.id,
        referrerEmail: row.referrer_email,
        kind: row.kind,
        summary: row.summary,
        createdAt: row.created_at,
      }));
    },
    async reserveWithdrawalAtomic({ email, amountPaise, method, idempotencyKey }) {
      const result = await request('rpc/referral_reserve_withdrawal', {
        method: 'POST',
        body: {
          p_email: email,
          p_amount: amountPaise,
          p_method: method,
          p_idempotency_key: idempotencyKey,
        },
      });
      const payload = result && typeof result === 'object' ? result : {};
      if (payload.id) {
        const withdrawal = await this.getWithdrawal(payload.id);
        return { ok: true, replayed: Boolean(payload.replayed), withdrawal };
      }
      return null;
    },
    async withUserLock(email, fn) {
      try {
        await request('rpc/referral_lock_profile', {
          method: 'POST',
          body: { p_email: email },
        });
      } catch {
        // Lock RPC is optional; unique constraints still apply.
      }
      return fn();
    },
    env,
  };
}

function unwrap(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function isMissing(error) {
  const status = Number(error?.status);
  const message = String(error?.message || '').toLowerCase();
  return status === 404 || status === 406 || message.includes('does not exist') || message.includes('schema cache');
}

function fromProductRow(row) {
  if (!row) return defaultProductReferralSettings();
  return {
    referralEnabled: row.referral_enabled,
    referralActive: row.referral_active,
    commissionSource: row.commission_source,
    commissionType: row.commission_type,
    fixedCommissionPaise: row.fixed_commission_paise,
    commissionPercentBps: row.commission_percent_bps,
    maxCommissionPaise: row.max_commission_paise,
    minOrderValuePaise: row.min_order_value_paise,
    holdingDays: row.holding_days,
    campaignStart: row.campaign_start || '',
    campaignEnd: row.campaign_end || '',
  };
}

function toProductRow(courseId, row) {
  return {
    course_id: courseId,
    referral_enabled: row.referralEnabled,
    referral_active: row.referralActive,
    commission_source: row.commissionSource,
    commission_type: row.commissionType,
    fixed_commission_paise: row.fixedCommissionPaise,
    commission_percent_bps: row.commissionPercentBps,
    max_commission_paise: row.maxCommissionPaise,
    min_order_value_paise: row.minOrderValuePaise,
    holding_days: row.holdingDays,
    campaign_start: row.campaignStart || null,
    campaign_end: row.campaignEnd || null,
    updated_at: new Date().toISOString(),
  };
}

function fromProfile(row) {
  return {
    email: row.email,
    code: row.code,
    status: row.status || 'active',
    termsVersion: row.terms_version || '',
    termsAcceptedAt: row.terms_accepted_at || '',
    createdAt: row.created_at,
  };
}

function toProfile(row) {
  return {
    email: row.email,
    code: row.code,
    status: row.status || 'active',
    terms_version: row.termsVersion || null,
    terms_accepted_at: row.termsAcceptedAt || null,
    updated_at: new Date().toISOString(),
  };
}

function fromAttribution(row) {
  return {
    id: row.id,
    referredEmail: row.referred_email,
    referrerEmail: row.referrer_email,
    code: row.code,
    expiresAt: row.expires_at,
    locked: row.locked,
    attributedAt: row.attributed_at,
  };
}

function fromCommission(row) {
  if (!row) return null;
  return {
    id: row.id,
    referrerEmail: row.referrer_email,
    referredEmail: row.referred_email,
    courseId: row.course_id,
    providerOrderId: row.provider_order_id,
    providerPaymentId: row.provider_payment_id,
    amountPaidPaise: row.amount_paid_paise,
    listPricePaise: row.list_price_paise,
    commissionType: row.commission_type,
    fixedCommissionPaise: row.fixed_commission_paise,
    percentBps: row.percent_bps,
    calculationBasis: row.calculation_basis,
    commissionPaise: row.commission_paise,
    holdingDays: row.holding_days,
    ruleVersion: row.rule_version,
    termsVersion: row.terms_version,
    currency: row.currency,
    status: row.status,
    fraudHold: Boolean(row.fraud_hold),
    reviewRequired: Boolean(row.review_required),
    availableAt: row.available_at,
    createdAt: row.created_at,
    reversedAt: row.reversed_at,
  };
}

function toCommission(row) {
  return {
    id: row.id,
    referrer_email: row.referrerEmail,
    referred_email: row.referredEmail,
    course_id: row.courseId,
    provider_order_id: row.providerOrderId,
    provider_payment_id: row.providerPaymentId,
    amount_paid_paise: row.amountPaidPaise,
    list_price_paise: row.listPricePaise,
    commission_type: row.commissionType,
    fixed_commission_paise: row.fixedCommissionPaise,
    percent_bps: row.percentBps,
    calculation_basis: row.calculationBasis,
    commission_paise: row.commissionPaise,
    holding_days: row.holdingDays,
    rule_version: row.ruleVersion,
    terms_version: row.termsVersion,
    currency: row.currency,
    status: row.status,
    fraud_hold: Boolean(row.fraudHold),
    review_required: Boolean(row.reviewRequired),
    available_at: row.availableAt,
  };
}

function fromLedger(row) {
  return {
    id: row.id,
    userEmail: row.user_email,
    type: row.type,
    direction: row.direction,
    amountPaise: row.amount_paise,
    currency: row.currency,
    status: row.status,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    description: row.description,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

function toLedger(row) {
  return {
    user_email: row.userEmail,
    type: row.type,
    direction: row.direction,
    amount_paise: row.amountPaise,
    currency: row.currency || 'INR',
    status: row.status || 'posted',
    reference_type: row.referenceType,
    reference_id: row.referenceId,
    description: row.description || '',
    idempotency_key: row.idempotencyKey,
  };
}

function fromWithdrawal(row) {
  return {
    id: row.id,
    userEmail: row.user_email,
    amountPaise: row.amount_paise,
    method: row.method,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    adminNote: row.admin_note || '',
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

function toWithdrawal(row) {
  return {
    user_email: row.userEmail,
    amount_paise: row.amountPaise,
    method: row.method,
    status: row.status,
    idempotency_key: row.idempotencyKey,
  };
}

function fromPayout(row) {
  return {
    email: row.email,
    method: row.method,
    encryptedPayload: row.encrypted_payload,
    fingerprint: row.fingerprint,
    updatedAt: row.updated_at,
  };
}
