/**
 * Single source of truth for the referral commission rate.
 * 10_000 basis points = 100%. 2_000 = 20%.
 * Admin forms and browsers must not override this.
 */
export const REFERRAL_COMMISSION_BPS = 2000;
export const REFERRAL_COMMISSION_BASIS = 'ACTUAL_AMOUNT_PAID';
export const REFERRAL_COMMISSION_TYPE = 'PERCENTAGE';
export const REFERRAL_COMMISSION_RATE_LABEL = '20%';
