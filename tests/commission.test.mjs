import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyPercentBps, percentToBps, rupeesToPaise } from '../lib/money.mjs';
import { calculateReferralCommission, snapshotCommission } from '../lib/commission.mjs';
import { REFERRAL_COMMISSION_BPS, REFERRAL_COMMISSION_RATE_LABEL } from '../lib/referral-rate.mjs';
import { normalizeReferralSettingsForm } from '../lib/referral-settings.mjs';

function settings({ global = {}, product = {} } = {}) {
  return {
    global: {
      programEnabled: true,
      defaultHoldingDays: 7,
      ...global,
    },
    product: {
      referralEnabled: true,
      referralActive: true,
      ...product,
    },
  };
}

describe('money helpers', () => {
  it('converts rupees to paise without floats', () => {
    assert.equal(rupeesToPaise('2499'), 249900);
    assert.equal(rupeesToPaise('10.50'), 1050);
    assert.equal(percentToBps('15'), 1500);
    assert.equal(percentToBps('15.5'), 1550);
  });

  it('rounds the fixed 20% commission half-up to paise', () => {
    assert.equal(applyPercentBps(249900, REFERRAL_COMMISSION_BPS), 49980);
    assert.equal(applyPercentBps(199900, REFERRAL_COMMISSION_BPS), 39980);
    assert.equal(applyPercentBps(1490000, REFERRAL_COMMISSION_BPS), 298000);
    assert.equal(applyPercentBps(100, 1), 0);
    assert.equal(applyPercentBps(5000, 1), 1);
  });
});

describe('calculateReferralCommission', () => {
  it('does not pay when the program is disabled', () => {
    const result = calculateReferralCommission({
      order: { amount: 249900, currency: 'INR' },
      product: { price: 2499 },
      referralSettings: settings({ global: { programEnabled: false } }),
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'program_disabled');
  });

  it('does not pay for a non-eligible product', () => {
    const result = calculateReferralCommission({
      order: { amount: 249900, currency: 'INR' },
      product: { price: 2499 },
      referralSettings: settings({ product: { referralEnabled: false } }),
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'product_not_eligible');
  });

  it('pays 20% of actual amount paid, not list price or a fixed override', () => {
    const result = calculateReferralCommission({
      order: { amount: 199900, currency: 'INR' },
      product: { price: 2499 },
      pricing: { amountPaidPaise: 199900, listPricePaise: 249900, currency: 'INR' },
      referralSettings: settings({
        global: { defaultCommissionType: 'FIXED_AMOUNT', defaultFixedPaise: 60000, defaultPercentBps: 1000 },
        product: {
          commissionSource: 'PRODUCT_OVERRIDE',
          commissionType: 'FIXED_AMOUNT',
          fixedCommissionPaise: 60000,
          commissionPercentBps: 5000,
        },
      }),
    });
    assert.equal(result.eligible, true);
    assert.equal(result.basis, 'ACTUAL_AMOUNT_PAID');
    assert.equal(result.percentBps, REFERRAL_COMMISSION_BPS);
    assert.equal(result.commissionPaise, 39980);
    const snap = snapshotCommission(result, { courseId: 'course-a' });
    assert.equal(snap.commissionPaise, 39980);
    assert.equal(snap.percentBps, REFERRAL_COMMISSION_BPS);
    assert.equal(snap.amountPaidPaise, 199900);
    assert.equal(snap.courseId, 'course-a');
  });

  it('uses 20% of a full list-price payment', () => {
    const result = calculateReferralCommission({
      order: { amount: 249900, currency: 'INR' },
      product: { price: 2499 },
      pricing: { amountPaidPaise: 249900, listPricePaise: 249900, currency: 'INR' },
      referralSettings: settings(),
    });
    assert.equal(result.commissionPaise, 49980);
  });

  it('ignores list-price and admin percent form fields', () => {
    const saved = normalizeReferralSettingsForm({
      referralProgramEnabled: 'true',
      referralDefaultPercentBps: 5000,
      referralDefaultPercent: '50',
      referralDefaultCommissionType: 'FIXED_AMOUNT',
      referralDefaultFixedRupees: '500',
      referralCalculationBasis: 'PRODUCT_LIST_PRICE',
      referralMinWithdrawalRupees: '100',
    });
    assert.equal(saved.percentBps, REFERRAL_COMMISSION_BPS);
    assert.equal(saved.commissionType, 'PERCENTAGE');
    assert.equal(saved.calculationBasis, 'ACTUAL_AMOUNT_PAID');
    assert.equal(saved.minWithdrawalPaise, 10000);
    assert.equal(saved.programEnabled, true);
    assert.equal(REFERRAL_COMMISSION_RATE_LABEL, '20%');
  });
});
