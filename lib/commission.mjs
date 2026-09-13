import { applyPercentBps, asNonNegativeInt, clampPaise, DEFAULT_CURRENCY } from './money.mjs';
import { campaignIsOpen, resolveReferralSettings } from './referral-settings.mjs';

/**
 * Central commission calculator. Frontend values are never authoritative.
 *
 * Rounding: percentage commissions use half-up to the nearest paise
 * via applyPercentBps (basisPaise * bps / 10_000, +5000 before divide).
 *
 * Historical records must snapshot the returned fields. Later admin
 * setting changes must not rewrite those snapshots.
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
  const basisAmountPaise = resolved.calculationBasis === 'PRODUCT_LIST_PRICE'
    ? listPricePaise
    : amountPaidPaise;

  const base = {
    eligible: false,
    reason: '',
    commissionType: resolved.commissionType,
    percentBps: resolved.percentBps,
    fixedPaise: resolved.fixedPaise,
    basis: resolved.calculationBasis,
    basisAmountPaise,
    listPricePaise,
    amountPaidPaise,
    rawPaise: 0,
    commissionPaise: 0,
    maxPaise: resolved.maxPaise,
    minOrderPaise: resolved.minOrderPaise,
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
  if (resolved.minOrderPaise && amountPaidPaise < resolved.minOrderPaise) {
    return { ...base, reason: 'below_min_order' };
  }

  const rawPaise = resolved.commissionType === 'FIXED_AMOUNT'
    ? resolved.fixedPaise
    : applyPercentBps(basisAmountPaise, resolved.percentBps);
  const commissionPaise = clampPaise(rawPaise, resolved.maxPaise);
  if (commissionPaise <= 0) {
    return { ...base, rawPaise, commissionPaise: 0, reason: 'zero_commission' };
  }

  return {
    ...base,
    eligible: true,
    reason: 'eligible',
    rawPaise,
    commissionPaise,
  };
}

export function snapshotCommission(calc, extras = {}) {
  return {
    productId: extras.productId || extras.courseId || '',
    amountPaidPaise: calc.amountPaidPaise,
    listPricePaise: calc.listPricePaise,
    commissionType: calc.commissionType,
    fixedCommissionPaise: calc.fixedPaise,
    percentBps: calc.percentBps,
    calculationBasis: calc.basis,
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
