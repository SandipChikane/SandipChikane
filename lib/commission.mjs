import { applyPercentBps, asNonNegativeInt, DEFAULT_CURRENCY } from './money.mjs';
import {
  REFERRAL_COMMISSION_BASIS,
  REFERRAL_COMMISSION_BPS,
  REFERRAL_COMMISSION_TYPE,
} from './referral-rate.mjs';
import { campaignIsOpen, resolveReferralSettings } from './referral-settings.mjs';

export {
  REFERRAL_COMMISSION_BASIS,
  REFERRAL_COMMISSION_BPS,
  REFERRAL_COMMISSION_TYPE,
} from './referral-rate.mjs';

/**
 * Central commission calculator. Frontend values are never authoritative.
 *
 * Rounding: half-up to the nearest paise
 *   commissionPaise = round_half_up(eligibleAmountPaise * 2000 / 10_000)
 * via applyPercentBps (BigInt, +5000 before divide).
 *
 * Historical records must snapshot the returned fields. The rate is
 * permanently 20%; snapshots still store the bps used at award time.
 */
export function calculateReferralCommission({
  order = {},
  product = {},
  pricing = {},
  referralSettings,
  now = new Date(),
} = {}) {
  const resolved = resolveReferralSettings(referralSettings?.global, referralSettings?.product);
  const listPricePaise = asNonNegativeInt(
    pricing.listPricePaise ?? product.listPricePaise ?? rupeePriceToPaise(product.price),
  );
  const amountPaidPaise = asNonNegativeInt(pricing.amountPaidPaise ?? order.amountPaise ?? order.amount);
  const currency = String(pricing.currency || order.currency || product.currency || DEFAULT_CURRENCY).toUpperCase();
  const percentBps = REFERRAL_COMMISSION_BPS;
  const basisAmountPaise = amountPaidPaise;

  const base = {
    eligible: false,
    reason: '',
    commissionType: REFERRAL_COMMISSION_TYPE,
    percentBps,
    fixedPaise: 0,
    basis: REFERRAL_COMMISSION_BASIS,
    basisAmountPaise,
    listPricePaise,
    amountPaidPaise,
    rawPaise: 0,
    commissionPaise: 0,
    maxPaise: 0,
    minOrderPaise: 0,
    holdingDays: resolved.holdingDays,
    ruleVersion: resolved.ruleVersion,
    termsVersion: resolved.termsVersion,
    currency,
    campaignValid: campaignIsOpen(resolved, now),
  };

  if (!resolved.global.programEnabled) {
    return { ...base, reason: 'program_disabled' };
  }
  if (!resolved.product.referralEnabled || !resolved.product.referralActive) {
    return { ...base, reason: 'product_not_eligible' };
  }
  if (!base.campaignValid) {
    return { ...base, reason: 'campaign_closed' };
  }
  if (currency && currency !== 'INR') {
    return { ...base, reason: 'unsupported_currency' };
  }

  const rawPaise = applyPercentBps(basisAmountPaise, percentBps);
  if (rawPaise <= 0) {
    return { ...base, rawPaise, commissionPaise: 0, reason: 'zero_commission' };
  }

  return {
    ...base,
    eligible: true,
    reason: 'eligible',
    rawPaise,
    commissionPaise: rawPaise,
  };
}

export function snapshotCommission(calc, extras = {}) {
  return {
    productId: extras.productId || extras.courseId || '',
    amountPaidPaise: calc.amountPaidPaise,
    listPricePaise: calc.listPricePaise,
    commissionType: REFERRAL_COMMISSION_TYPE,
    fixedCommissionPaise: 0,
    percentBps: REFERRAL_COMMISSION_BPS,
    calculationBasis: REFERRAL_COMMISSION_BASIS,
    commissionPaise: calc.commissionPaise,
    holdingDays: calc.holdingDays,
    ruleVersion: calc.ruleVersion,
    termsVersion: calc.termsVersion,
    currency: calc.currency,
    ...extras,
  };
}

function rupeePriceToPaise(price) {
  return asNonNegativeInt(price) * 100;
}
