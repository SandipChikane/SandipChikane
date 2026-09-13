import { computeBalances } from './ledger.mjs';
import { asNonNegativeInt } from './money.mjs';
import { decryptPayoutDetails, encryptPayoutDetails, maskPayoutDetails } from './payout-crypto.mjs';
import { payoutFingerprint } from './referral-privacy.mjs';

const OPEN = new Set(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING']);

export function withdrawalEligibility({ availablePaise, thresholdPaise }) {
  const available = asNonNegativeInt(availablePaise);
  const threshold = asNonNegativeInt(thresholdPaise);
  if (!threshold) {
    return {
      eligible: false,
      reason: 'no_qualifying_purchase',
      availablePaise: available,
      thresholdPaise: 0,
      remainingPaise: 0,
    };
  }
  const remaining = Math.max(0, threshold - available);
  return {
    eligible: available >= threshold,
    reason: available >= threshold ? 'eligible' : 'below_threshold',
    availablePaise: available,
    thresholdPaise: threshold,
    remainingPaise: remaining,
  };
}

export function createWithdrawalServices({ store, env = {}, now = () => new Date() }) {
  async function publicPayout(email) {
    const row = await store.getPayoutAccount(email);
    if (!row) return null;
    const details = decryptPayoutDetails(row.encryptedPayload, env) || {};
    return maskPayoutDetails(details, row.method);
  }

  async function savePayout({ email, method, details, currentFingerprint }) {
    if (method !== 'UPI' && method !== 'BANK') {
      const error = new Error('Choose UPI or a bank account.');
      error.status = 400;
      throw error;
    }
    if (method === 'UPI' && !String(details.upiId || '').includes('@')) {
      const error = new Error('Enter a valid UPI ID.');
      error.status = 400;
      throw error;
    }
    if (method === 'BANK' && (!details.accountNumber || !details.ifsc)) {
      const error = new Error('Account number and IFSC are required.');
      error.status = 400;
      throw error;
    }
    const fingerprint = payoutFingerprint(String(env.ADMIN_SESSION_SECRET || ''), method, details);
    const duplicates = await store.listPayoutByFingerprint(fingerprint, email);
    if (duplicates.length) {
      await store.addFlag({
        userEmail: email,
        relatedEmail: duplicates[0].email,
        signal: 'shared_payout_destination',
        detail: { method },
      });
    }
    return store.savePayoutAccount({
      email,
      method,
      encryptedPayload: encryptPayoutDetails(details, env),
      fingerprint: currentFingerprint || fingerprint,
    });
  }

  async function balancesFor(email) {
    const [commissions, withdrawals] = await Promise.all([
      store.listCommissionsByReferrer(email),
      store.listWithdrawals(email),
    ]);
    return computeBalances({ commissions, withdrawals });
  }

  async function requestWithdrawal({
    email,
    amountPaise,
    method,
    idempotencyKey,
    settings,
  }) {
    if (!settings.withdrawalEnabled) {
      const error = new Error('Withdrawals are not enabled.');
      error.status = 403;
      throw error;
    }
    if (!settings.supportedPayoutMethods.includes(method)) {
      const error = new Error('That payout method is not enabled.');
      error.status = 400;
      throw error;
    }
    const amount = asNonNegativeInt(amountPaise);
    if (amount <= 0) {
      const error = new Error('Enter a withdrawal amount greater than zero.');
      error.status = 400;
      throw error;
    }
    if (settings.minWithdrawalPaise && amount < settings.minWithdrawalPaise) {
      const error = new Error('Amount is below the minimum withdrawal.');
      error.status = 400;
      throw error;
    }
    if (settings.maxWithdrawalPaise && amount > settings.maxWithdrawalPaise) {
      const error = new Error('Amount is above the maximum withdrawal.');
      error.status = 400;
      throw error;
    }
    const profile = await store.getProfile(email);
    const currentBalances = await balancesFor(email);
    const gate = withdrawalEligibility({
      availablePaise: currentBalances.available,
      thresholdPaise: profile?.withdrawalThresholdPaise,
    });
    if (!gate.eligible) {
      const error = new Error(gate.reason === 'no_qualifying_purchase'
        ? 'Withdrawals unlock after you purchase a course and your available earnings reach that purchase amount.'
        : 'Available referral earnings have not reached your course-purchase threshold.');
      error.status = 403;
      throw error;
    }
    const payout = await store.getPayoutAccount(email);
    if (!payout || payout.method !== method) {
      const error = new Error('Save a matching payout method before requesting a withdrawal.');
      error.status = 400;
      throw error;
    }
    if (idempotencyKey) {
      const existing = (await store.listWithdrawals(email))
        .find((row) => row.idempotencyKey === idempotencyKey);
      if (existing) return { ok: true, replayed: true, withdrawal: existing };
    }
    if (store.reserveWithdrawalAtomic) {
      try {
        const reserved = await store.reserveWithdrawalAtomic({
          email,
          amountPaise: amount,
          method,
          idempotencyKey,
        });
        if (reserved?.withdrawal) {
          await store.addAdminNotice?.({
            kind: 'WITHDRAWAL_REQUEST',
            withdrawalId: reserved.withdrawal.id,
            userEmail: email,
            amountPaise: reserved.withdrawal.amountPaise,
            method,
          });
          return reserved;
        }
      } catch (error) {
        const message = String(error.message || '');
        if (message.includes('insufficient_available')) {
          const fail = new Error('Available earnings are not enough for this withdrawal.');
          fail.status = 409;
          throw fail;
        }
        if (message.includes('below_threshold')) {
          const fail = new Error('Available referral earnings have not reached your course-purchase threshold.');
          fail.status = 403;
          throw fail;
        }
        if (message.includes('invalid_amount')) {
          const fail = new Error('Enter a withdrawal amount greater than zero.');
          fail.status = 400;
          throw fail;
        }
      }
    }
    return store.withUserLock(email, async () => {
      if (idempotencyKey) {
        const existing = (await store.listWithdrawals(email))
          .find((row) => row.idempotencyKey === idempotencyKey);
        if (existing) return { ok: true, replayed: true, withdrawal: existing };
      }
      const balances = await balancesFor(email);
      if (amount > balances.available) {
        const error = new Error('Available earnings are not enough for this withdrawal.');
        error.status = 409;
        throw error;
      }
      const withdrawal = await store.insertWithdrawal({
        userEmail: email,
        amountPaise: amount,
        method,
        status: 'PENDING',
        idempotencyKey: idempotencyKey || `wd:${email}:${amount}:${now().toISOString()}`,
      });
      await store.insertLedger({
        userEmail: email,
        type: 'WITHDRAWAL_RESERVED',
        direction: 'debit',
        amountPaise: amount,
        currency: 'INR',
        status: 'posted',
        referenceType: 'withdrawal',
        referenceId: withdrawal.id,
        description: 'Withdrawal reserved from available earnings',
        idempotencyKey: `reserve:${withdrawal.id}`,
      });
      if (store.addAdminNotice) {
        await store.addAdminNotice({
          kind: 'WITHDRAWAL_REQUEST',
          withdrawalId: withdrawal.id,
          userEmail: email,
          amountPaise: amount,
          method,
        });
      }
      return { ok: true, withdrawal };
    });
  }

  async function setWithdrawalStatus(id, status, adminNote = '', providerReference = '') {
    const current = await store.getWithdrawal(id);
    if (!current) {
      const error = new Error('Withdrawal not found.');
      error.status = 404;
      throw error;
    }
    if (current.status === 'PAID' && status !== 'PAID') {
      const error = new Error('A paid withdrawal cannot change status.');
      error.status = 409;
      throw error;
    }
    const updated = await store.updateWithdrawal(id, {
      status,
      adminNote,
      providerReference: providerReference || current.providerReference || '',
      paidAt: status === 'PAID' ? now().toISOString() : current.paidAt,
    });
    if (status === 'PAID') {
      if (store.addActivity) {
        await store.addActivity({
          referrerEmail: current.userEmail,
          kind: 'withdrawal',
          summary: 'A withdrawal was marked paid.',
        });
      }
      await store.insertLedger({
        userEmail: current.userEmail,
        type: 'WITHDRAWAL_COMPLETED',
        direction: 'debit',
        amountPaise: current.amountPaise,
        currency: 'INR',
        status: 'posted',
        referenceType: 'withdrawal',
        referenceId: current.id,
        description: 'Withdrawal marked paid',
        idempotencyKey: `paid:${current.id}`,
      });
    }
    if (status === 'REJECTED' || status === 'CANCELLED' || status === 'FAILED') {
      await store.insertLedger({
        userEmail: current.userEmail,
        type: status === 'REJECTED' ? 'WITHDRAWAL_REJECTED' : 'WITHDRAWAL_RELEASED',
        direction: 'credit',
        amountPaise: current.amountPaise,
        currency: 'INR',
        status: 'posted',
        referenceType: 'withdrawal',
        referenceId: current.id,
        description: `Withdrawal ${status.toLowerCase()}; reserved funds released`,
        idempotencyKey: `release:${current.id}:${status}`,
      });
    }
    return updated;
  }

  return {
    publicPayout,
    savePayout,
    balancesFor,
    requestWithdrawal,
    setWithdrawalStatus,
    openStatuses: OPEN,
    withdrawalEligibility,
  };
}
