import { asNonNegativeInt, percentToBps, rupeesToPaise } from './money.mjs';

export const COMMISSION_TYPES = ['FIXED_AMOUNT', 'PERCENTAGE'];
export const COMMISSION_SOURCES = ['GLOBAL_DEFAULT', 'PRODUCT_OVERRIDE'];
export const CALCULATION_BASES = ['ACTUAL_AMOUNT_PAID', 'PRODUCT_LIST_PRICE'];
export const PARTIAL_REFUND_POLICIES = ['FULL_REVERSAL', 'PROPORTIONAL', 'THRESHOLD'];
export const CHARGEBACK_POLICIES = ['FREEZE_THEN_REVERSE', 'REVERSE_ON_LOST'];

export function defaultGlobalReferralSettings() {
  return {
    programEnabled: false,
    withdrawalEnabled: false,
    productOverridesEnabled: true,
    defaultCommissionType: 'PERCENTAGE',
    defaultFixedPaise: 0,
    defaultPercentBps: 0,
    defaultHoldingDays: 7,
    attributionDays: 30,
    minWithdrawalPaise: 0,
    maxWithdrawalPaise: 0,
    calculationBasis: 'ACTUAL_AMOUNT_PAID',
    termsVersion: '1',
    ruleVersion: 1,
    partialRefundPolicy: 'FULL_REVERSAL',
    chargebackPolicy: 'FREEZE_THEN_REVERSE',
    fraudReviewThreshold: 3,
    supportedPayoutMethods: ['UPI', 'BANK'],
  };
}

export function defaultProductReferralSettings() {
  return {
    referralEnabled: true,
    referralActive: true,
    commissionSource: 'GLOBAL_DEFAULT',
    commissionType: 'PERCENTAGE',
    fixedCommissionPaise: 0,
    commissionPercentBps: 0,
    maxCommissionPaise: 0,
    minOrderValuePaise: 0,
    holdingDays: null,
    campaignStart: '',
    campaignEnd: '',
  };
}

export function parseGlobalReferralSettings(raw = {}) {
  const defaults = defaultGlobalReferralSettings();
  const source = raw && typeof raw === 'object' ? raw : {};
  const type = COMMISSION_TYPES.includes(source.defaultCommissionType)
    ? source.defaultCommissionType
    : defaults.defaultCommissionType;
  const basis = CALCULATION_BASES.includes(source.calculationBasis)
    ? source.calculationBasis
    : defaults.calculationBasis;
  const partial = PARTIAL_REFUND_POLICIES.includes(source.partialRefundPolicy)
    ? source.partialRefundPolicy
    : defaults.partialRefundPolicy;
  const chargeback = CHARGEBACK_POLICIES.includes(source.chargebackPolicy)
    ? source.chargebackPolicy
    : defaults.chargebackPolicy;
  const methods = Array.isArray(source.supportedPayoutMethods)
    ? source.supportedPayoutMethods.filter((item) => item === 'UPI' || item === 'BANK')
    : defaults.supportedPayoutMethods;
  return {
    programEnabled: asBool(source.programEnabled, defaults.programEnabled),
    withdrawalEnabled: asBool(source.withdrawalEnabled, defaults.withdrawalEnabled),
    productOverridesEnabled: asBool(source.productOverridesEnabled, defaults.productOverridesEnabled),
    defaultCommissionType: type,
    defaultFixedPaise: asNonNegativeInt(source.defaultFixedPaise ?? defaults.defaultFixedPaise),
    defaultPercentBps: asNonNegativeInt(source.defaultPercentBps ?? defaults.defaultPercentBps),
    defaultHoldingDays: asNonNegativeInt(source.defaultHoldingDays ?? defaults.defaultHoldingDays),
    attributionDays: Math.max(1, asNonNegativeInt(source.attributionDays ?? defaults.attributionDays) || 30),
    minWithdrawalPaise: asNonNegativeInt(source.minWithdrawalPaise ?? defaults.minWithdrawalPaise),
    maxWithdrawalPaise: asNonNegativeInt(source.maxWithdrawalPaise ?? defaults.maxWithdrawalPaise),
    calculationBasis: basis,
    termsVersion: String(source.termsVersion || defaults.termsVersion).slice(0, 32),
    ruleVersion: Math.max(1, asNonNegativeInt(source.ruleVersion ?? defaults.ruleVersion) || 1),
    partialRefundPolicy: partial,
    chargebackPolicy: chargeback,
    fraudReviewThreshold: Math.max(1, asNonNegativeInt(source.fraudReviewThreshold ?? defaults.fraudReviewThreshold) || 3),
    supportedPayoutMethods: methods.length ? methods : defaults.supportedPayoutMethods,
  };
}

export function parseProductReferralSettings(raw = {}) {
  const defaults = defaultProductReferralSettings();
  const source = raw && typeof raw === 'object' ? raw : {};
  const sourceMode = COMMISSION_SOURCES.includes(source.commissionSource)
    ? source.commissionSource
    : defaults.commissionSource;
  const type = COMMISSION_TYPES.includes(source.commissionType)
    ? source.commissionType
    : defaults.commissionType;
  const holding = source.holdingDays == null || source.holdingDays === ''
    ? null
    : asNonNegativeInt(source.holdingDays);
  return {
    referralEnabled: asBool(source.referralEnabled, defaults.referralEnabled),
    referralActive: asBool(source.referralActive, defaults.referralActive),
    commissionSource: sourceMode,
    commissionType: type,
    fixedCommissionPaise: asNonNegativeInt(source.fixedCommissionPaise ?? defaults.fixedCommissionPaise),
    commissionPercentBps: asNonNegativeInt(source.commissionPercentBps ?? defaults.commissionPercentBps),
    maxCommissionPaise: asNonNegativeInt(source.maxCommissionPaise ?? defaults.maxCommissionPaise),
    minOrderValuePaise: asNonNegativeInt(source.minOrderValuePaise ?? defaults.minOrderValuePaise),
    holdingDays: holding,
    campaignStart: String(source.campaignStart || ''),
    campaignEnd: String(source.campaignEnd || ''),
  };
}

export function resolveReferralSettings(globalInput, productInput) {
  const global = parseGlobalReferralSettings(globalInput);
  const product = parseProductReferralSettings(productInput);
  const useOverride = global.productOverridesEnabled && product.commissionSource === 'PRODUCT_OVERRIDE';
  return {
    global,
    product,
    enabled: global.programEnabled && product.referralEnabled && product.referralActive,
    commissionType: useOverride ? product.commissionType : global.defaultCommissionType,
    fixedPaise: useOverride ? product.fixedCommissionPaise : global.defaultFixedPaise,
    percentBps: useOverride ? product.commissionPercentBps : global.defaultPercentBps,
    maxPaise: product.maxCommissionPaise,
    minOrderPaise: product.minOrderValuePaise,
    holdingDays: product.holdingDays == null ? global.defaultHoldingDays : product.holdingDays,
    calculationBasis: global.calculationBasis,
    ruleVersion: global.ruleVersion,
    campaignStart: product.campaignStart,
    campaignEnd: product.campaignEnd,
    termsVersion: global.termsVersion,
    partialRefundPolicy: global.partialRefundPolicy,
    chargebackPolicy: global.chargebackPolicy,
  };
}

export function normalizeReferralSettingsForm(body = {}) {
  const current = parseGlobalReferralSettings(readStoredReferralSettings(body));
  const next = parseGlobalReferralSettings({
    programEnabled: asBool(body.referralProgramEnabled, current.programEnabled),
    withdrawalEnabled: asBool(body.referralWithdrawalEnabled, current.withdrawalEnabled),
    productOverridesEnabled: asBool(body.referralProductOverridesEnabled, current.productOverridesEnabled),
    defaultCommissionType: body.referralDefaultCommissionType || current.defaultCommissionType,
    defaultFixedPaise: body.referralDefaultFixedPaise != null
      ? asNonNegativeInt(body.referralDefaultFixedPaise)
      : rupeesToPaise(body.referralDefaultFixedRupees ?? paiseFallback(current.defaultFixedPaise)),
    defaultPercentBps: body.referralDefaultPercentBps != null
      ? asNonNegativeInt(body.referralDefaultPercentBps)
      : body.referralDefaultPercent != null
        ? percentToBps(body.referralDefaultPercent)
        : current.defaultPercentBps,
    defaultHoldingDays: asNonNegativeInt(body.referralDefaultHoldingDays ?? current.defaultHoldingDays),
    attributionDays: asNonNegativeInt(body.referralAttributionDays ?? current.attributionDays),
    minWithdrawalPaise: body.referralMinWithdrawalPaise != null
      ? asNonNegativeInt(body.referralMinWithdrawalPaise)
      : rupeesToPaise(body.referralMinWithdrawalRupees ?? paiseFallback(current.minWithdrawalPaise)),
    maxWithdrawalPaise: body.referralMaxWithdrawalPaise != null
      ? asNonNegativeInt(body.referralMaxWithdrawalPaise)
      : rupeesToPaise(body.referralMaxWithdrawalRupees ?? paiseFallback(current.maxWithdrawalPaise)),
    calculationBasis: body.referralCalculationBasis || current.calculationBasis,
    termsVersion: body.referralTermsVersion || current.termsVersion,
    partialRefundPolicy: body.referralPartialRefundPolicy || current.partialRefundPolicy,
    chargebackPolicy: body.referralChargebackPolicy || current.chargebackPolicy,
    fraudReviewThreshold: asNonNegativeInt(body.referralFraudReviewThreshold ?? current.fraudReviewThreshold),
    supportedPayoutMethods: String(body.referralSupportedPayoutMethods || current.supportedPayoutMethods.join(','))
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter((item) => item === 'UPI' || item === 'BANK'),
    ruleVersion: current.ruleVersion,
  });
  if (commercialSettingsChanged(current, next)) {
    next.ruleVersion = current.ruleVersion + 1;
  }
  return next;
}

export function flattenReferralSettings(settings) {
  const parsed = parseGlobalReferralSettings(settings);
  return {
    referralProgramEnabled: parsed.programEnabled ? 'true' : 'false',
    referralWithdrawalEnabled: parsed.withdrawalEnabled ? 'true' : 'false',
    referralProductOverridesEnabled: parsed.productOverridesEnabled ? 'true' : 'false',
    referralDefaultCommissionType: parsed.defaultCommissionType,
    referralDefaultFixedPaise: parsed.defaultFixedPaise,
    referralDefaultPercentBps: parsed.defaultPercentBps,
    referralDefaultHoldingDays: parsed.defaultHoldingDays,
    referralAttributionDays: parsed.attributionDays,
    referralMinWithdrawalPaise: parsed.minWithdrawalPaise,
    referralMaxWithdrawalPaise: parsed.maxWithdrawalPaise,
    referralCalculationBasis: parsed.calculationBasis,
    referralTermsVersion: parsed.termsVersion,
    referralRuleVersion: parsed.ruleVersion,
    referralPartialRefundPolicy: parsed.partialRefundPolicy,
    referralChargebackPolicy: parsed.chargebackPolicy,
    referralFraudReviewThreshold: parsed.fraudReviewThreshold,
    referralSupportedPayoutMethods: parsed.supportedPayoutMethods.join(','),
  };
}

export function readStoredReferralSettings(settings = {}) {
  if (settings.referral && typeof settings.referral === 'object') {
    return parseGlobalReferralSettings(settings.referral);
  }
  return parseGlobalReferralSettings({
    programEnabled: settings.referralProgramEnabled,
    withdrawalEnabled: settings.referralWithdrawalEnabled,
    productOverridesEnabled: settings.referralProductOverridesEnabled,
    defaultCommissionType: settings.referralDefaultCommissionType,
    defaultFixedPaise: settings.referralDefaultFixedPaise,
    defaultPercentBps: settings.referralDefaultPercentBps,
    defaultHoldingDays: settings.referralDefaultHoldingDays,
    attributionDays: settings.referralAttributionDays,
    minWithdrawalPaise: settings.referralMinWithdrawalPaise,
    maxWithdrawalPaise: settings.referralMaxWithdrawalPaise,
    calculationBasis: settings.referralCalculationBasis,
    termsVersion: settings.referralTermsVersion,
    ruleVersion: settings.referralRuleVersion,
    partialRefundPolicy: settings.referralPartialRefundPolicy,
    chargebackPolicy: settings.referralChargebackPolicy,
    fraudReviewThreshold: settings.referralFraudReviewThreshold,
    supportedPayoutMethods: String(settings.referralSupportedPayoutMethods || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  });
}

export function campaignIsOpen(settings, now = new Date()) {
  const start = settings.campaignStart ? Date.parse(settings.campaignStart) : NaN;
  const end = settings.campaignEnd ? Date.parse(settings.campaignEnd) : NaN;
  const ts = now.getTime();
  if (Number.isFinite(start) && ts < start) return false;
  if (Number.isFinite(end) && ts > end) return false;
  return true;
}

function asBool(value, fallback = false) {
  if (value === true || value === 'true' || value === '1' || value === 1 || value === 'on') return true;
  if (value === false || value === 'false' || value === '0' || value === 0 || value === 'off') return false;
  return fallback;
}

function paiseFallback(paise) {
  return String(Math.trunc(asNonNegativeInt(paise) / 100));
}

function commercialSettingsChanged(previous, next) {
  const keys = [
    'defaultCommissionType',
    'defaultFixedPaise',
    'defaultPercentBps',
    'defaultHoldingDays',
    'calculationBasis',
    'minWithdrawalPaise',
    'maxWithdrawalPaise',
    'productOverridesEnabled',
  ];
  return keys.some((key) => previous[key] !== next[key]);
}
