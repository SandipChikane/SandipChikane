import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyPercentBps, percentToBps, rupeesToPaise } from '../lib/money.mjs';
import { calculateReferralCommission, snapshotCommission } from '../lib/commission.mjs';

function settings({ global = {}, product = {} } = {}) {
  return {
    global: {
      programEnabled: true,
      defaultCommissionType: 'FIXED_AMOUNT',
      defaultFixedPaise: 50000,
      defaultPercentBps: 1500,
      defaultHoldingDays: 7,
      calculationBasis: 'ACTUAL_AMOUNT_PAID',
      productOverridesEnabled: true,
      ...global,
    },
    product: {
      referralEnabled: true,
      referralActive: true,
      commissionSource: 'GLOBAL_DEFAULT',
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

  it('rounds percentage commissions half-up to paise', () => {
    assert.equal(applyPercentBps(149900, 1500), 22485);
    assert.equal(applyPercentBps(100, 1), 0);
    assert.equal(applyPercentBps(5000, 1), 1);
  });
});

describe('calculateReferralCommission', () => {
  it('does not pay when the program is disabled', () => {
    const result = calculateReferralCommission({
      order: { amount: 149900, currency: 'INR' },
      product: { price: 1499 },
      referralSettings: settings({ global: { programEnabled: false } }),
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'program_disabled');
  });

  it('does not pay for a non-eligible product', () => {
    const result = calculateReferralCommission({
      order: { amount: 149900, currency: 'INR' },
      product: { price: 1499 },
      referralSettings: settings({ product: { referralEnabled: false } }),
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'product_not_eligible');
  });

  it('uses a fixed override and snapshots the amount', () => {
    const result = calculateReferralCommission({
      order: { amount: 249900, currency: 'INR' },
      product: { price: 2499 },
      referralSettings: settings({
        product: {
          commissionSource: 'PRODUCT_OVERRIDE',
          commissionType: 'FIXED_AMOUNT',
          fixedCommissionPaise: 60000,
        },
      }),
    });
    assert.equal(result.eligible, true);
    assert.equal(result.commissionPaise, 60000);
    const snap = snapshotCommission(result, { courseId: 'course-a' });
    assert.equal(snap.commissionPaise, 60000);
    assert.equal(snap.courseId, 'course-a');
  });

  it('uses actual amount paid for percentage commissions by default', () => {
    const result = calculateReferralCommission({
      order: { amount: 100000, currency: 'INR' },
      product: { price: 2000 },
      pricing: { amountPaidPaise: 100000, listPricePaise: 200000, currency: 'INR' },
      referralSettings: settings({
        global: { defaultCommissionType: 'PERCENTAGE', defaultPercentBps: 1000 },
      }),
    });
    assert.equal(result.basis, 'ACTUAL_AMOUNT_PAID');
    assert.equal(result.commissionPaise, 10000);
  });

  it('can calculate against list price when configured', () => {
    const result = calculateReferralCommission({
      order: { amount: 100000, currency: 'INR' },
      product: { price: 2000 },
      pricing: { amountPaidPaise: 100000, listPricePaise: 200000, currency: 'INR' },
      referralSettings: settings({
        global: {
          defaultCommissionType: 'PERCENTAGE',
          defaultPercentBps: 1000,
          calculationBasis: 'PRODUCT_LIST_PRICE',
        },
      }),
    });
    assert.equal(result.commissionPaise, 20000);
  });

  it('enforces a minimum eligible order value', () => {
    const result = calculateReferralCommission({
      order: { amount: 50000, currency: 'INR' },
      product: { price: 500 },
      referralSettings: settings({
        product: { minOrderValuePaise: 100000 },
      }),
    });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'below_min_order');
  });
});
