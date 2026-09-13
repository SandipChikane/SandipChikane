import { asNonNegativeInt, rupeesToPaise } from './money.mjs';
import { REFERRAL_COMMISSION_BASIS, REFERRAL_COMMISSION_BPS, REFERRAL_COMMISSION_RATE_LABEL, REFERRAL_COMMISSION_TYPE } from './referral-rate.mjs';

export const CHARGEBACK_POLICIES = ['FREEZE_THEN_REVERSE', 'REVERSE_ON_LOST'];

export function defaultGlobalReferralSettings() {
  return {
    programEnabled: false,
    withdrawalEnabled: false,
    defaultHoldingDays: 7,
    attributionDays: 30,
    minWithdrawalPaise: 0,
    maxWithdrawalPaise: 0,
    termsVersion: '1',
    ruleVersion: 1,
    chargebackPolicy: 'FREEZE_THEN_REVERSE',
    fraudReviewThreshold: 3,
    supportedPayoutMethods: ['UPI', 'BANK'],
  };
}

export function defaultProductReferralSettings() {
  return {
    referralEnabled: true,
    referralActive: true,
    campaignStart: '',
    campaignEnd: '',
  };
}

export function parseGlobalReferralSettings(raw = {}) {
  const defaults = defaultGlobalReferralSettings();
  const source = raw && typeof raw === 'object' ? raw : {};
  const chargeback = CHARGEBACK_POLICIES.includes(source.chargebackPolicy)
    ? source.chargebackPolicy
    : defaults.chargebackPolicy;
  const methods = Array.isArray(source.supportedPayoutMethods)
    ? source.supportedPayoutMethods.filter((item) => item === 'UPI' || item === 'BANK')
    : defaults.supportedPayoutMethods;
  return {
    programEnabled: asBool(source.programEnabled, defaults.programEnabled),
    withdrawalEnabled: asBool(source.withdrawalEnabled, defaults.withdrawalEnabled),
    defaultHoldingDays: asNonNegativeInt(source.defaultHoldingDays ?? defaults.defaultHoldingDays),
    attributionDays: Math.max(1, asNonNegativeInt(source.attributionDays ?? defaults.attributionDays) || 30),
    minWithdrawalPaise: asNonNegativeInt(source.minWithdrawalPaise ?? defaults.minWithdrawalPaise),
    maxWithdrawalPaise: asNonNegativeInt(source.maxWithdrawalPaise ?? defaults.maxWithdrawalPaise),
    termsVersion: String(source.termsVersion || defaults.termsVersion).slice(0, 32),
    ruleVersion: Math.max(1, asNonNegativeInt(source.ruleVersion ?? defaults.ruleVersion) || 1),
    chargebackPolicy: chargeback,
    fraudReviewThreshold: Math.max(1, asNonNegativeInt(source.fraudReviewThreshold ?? defaults.fraudReviewThreshold) || 3),
    supportedPayoutMethods: methods.length ? methods : defaults.supportedPayoutMethods,
    commissionType: REFERRAL_COMMISSION_TYPE,
    percentBps: REFERRAL_COMMISSION_BPS,
    calculationBasis: REFERRAL_COMMISSION_BASIS,
  };
}

export function parseProductReferralSettings(raw = {}) {
  const defaults = defaultProductReferralSettings();
  const source = raw && typeof raw === 'object' ? raw : {};
  const enabled = asBool(source.referralEnabled, defaults.referralEnabled);
  return {
    referralEnabled: enabled,
    referralActive: asBool(source.referralActive, enabled),
    campaignStart: String(source.campaignStart || ''),
    campaignEnd: String(source.campaignEnd || ''),
  };
}

export function resolveReferralSettings(globalInput, productInput) {
  const global = parseGlobalReferralSettings(globalInput);
  const product = parseProductReferralSettings(productInput);
  return {
    global,
    product,
    enabled: global.programEnabled && product.referralEnabled && product.referralActive,
    commissionType: REFERRAL_COMMISSION_TYPE,
    fixedPaise: 0,
    percentBps: REFERRAL_COMMISSION_BPS,
    maxPaise: 0,
    minOrderPaise: 0,
    holdingDays: global.defaultHoldingDays,
    calculationBasis: REFERRAL_COMMISSION_BASIS,
    ruleVersion: global.ruleVersion,
    campaignStart: product.campaignStart,
    campaignEnd: product.campaignEnd,
    termsVersion: global.termsVersion,
    partialRefundPolicy: 'PROPORTIONAL',
    chargebackPolicy: global.chargebackPolicy,
  };
}

export function normalizeReferralSettingsForm(body = {}) {
  const current = parseGlobalReferralSettings(readStoredReferralSettings(body));
  const next = parseGlobalReferralSettings({
    programEnabled: asBool(body.referralProgramEnabled, current.programEnabled),
    withdrawalEnabled: asBool(body.referralWithdrawalEnabled, current.withdrawalEnabled),
    defaultHoldingDays: asNonNegativeInt(body.referralDefaultHoldingDays ?? current.defaultHoldingDays),
    attributionDays: asNonNegativeInt(body.referralAttributionDays ?? current.attributionDays),
    minWithdrawalPaise: body.referralMinWithdrawalRupees != null && body.referralMinWithdrawalRupees !== ''
      ? rupeesToPaise(body.referralMinWithdrawalRupees)
      : asNonNegativeInt(body.referralMinWithdrawalPaise ?? current.minWithdrawalPaise),
    maxWithdrawalPaise: body.referralMaxWithdrawalRupees != null && body.referralMaxWithdrawalRupees !== ''
      ? rupeesToPaise(body.referralMaxWithdrawalRupees)
      : asNonNegativeInt(body.referralMaxWithdrawalPaise ?? current.maxWithdrawalPaise),
    termsVersion: body.referralTermsVersion || current.termsVersion,
    chargebackPolicy: body.referralChargebackPolicy || current.chargebackPolicy,
    fraudReviewThreshold: asNonNegativeInt(body.referralFraudReviewThreshold ?? current.fraudReviewThreshold),
    supportedPayoutMethods: String(body.referralSupportedPayoutMethods || current.supportedPayoutMethods.join(','))
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter((item) => item === 'UPI' || item === 'BANK'),
    ruleVersion: current.ruleVersion,
  });
  if (operationalSettingsChanged(current, next)) {
    next.ruleVersion = current.ruleVersion + 1;
  }
  return next;
}

export function flattenReferralSettings(settings) {
  const parsed = parseGlobalReferralSettings(settings);
  return {
    referralProgramEnabled: parsed.programEnabled ? 'true' : 'false',
    referralWithdrawalEnabled: parsed.withdrawalEnabled ? 'true' : 'false',
    referralDefaultHoldingDays: parsed.defaultHoldingDays,
    referralAttributionDays: parsed.attributionDays,
    referralMinWithdrawalPaise: parsed.minWithdrawalPaise,
    referralMaxWithdrawalPaise: parsed.maxWithdrawalPaise,
    referralTermsVersion: parsed.termsVersion,
    referralRuleVersion: parsed.ruleVersion,
    referralChargebackPolicy: parsed.chargebackPolicy,
    referralFraudReviewThreshold: parsed.fraudReviewThreshold,
    referralSupportedPayoutMethods: parsed.supportedPayoutMethods.join(','),
    referralCommissionBps: REFERRAL_COMMISSION_BPS,
    referralCommissionBasis: REFERRAL_COMMISSION_BASIS,
    referralCommissionRateLabel: REFERRAL_COMMISSION_RATE_LABEL,
  };
}

export function readStoredReferralSettings(settings = {}) {
  if (settings.referral && typeof settings.referral === 'object') {
    return parseGlobalReferralSettings(settings.referral);
  }
  return parseGlobalReferralSettings({
    programEnabled: settings.referralProgramEnabled,
    withdrawalEnabled: settings.referralWithdrawalEnabled,
    defaultHoldingDays: settings.referralDefaultHoldingDays,
    attributionDays: settings.referralAttributionDays,
    minWithdrawalPaise: settings.referralMinWithdrawalPaise,
    maxWithdrawalPaise: settings.referralMaxWithdrawalPaise,
    termsVersion: settings.referralTermsVersion,
    ruleVersion: settings.referralRuleVersion,
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

function operationalSettingsChanged(previous, next) {
  const keys = [
    'defaultHoldingDays',
    'minWithdrawalPaise',
    'maxWithdrawalPaise',
    'attributionDays',
    'withdrawalEnabled',
  ];
  return keys.some((key) => previous[key] !== next[key]);
}
