/**
 * Integer money helpers.
 *
 * All stored financial amounts are integer paise (₹1 = 100 paise).
 * Do not use IEEE floats for commission math.
 *
 * Admin price fields remain integer INR rupees on `courses.price`.
 * Convert at the boundary: rupeesToPaise / paiseToRupeesText.
 *
 * Percentage rounding (half-up to the nearest paise):
 *   commissionPaise = round_half_up(basisPaise * percentBps / 10_000)
 * where percentBps is basis points (15.00% = 1500).
 * Implemented with BigInt so 149900 * 1500 / 10000 is exact before rounding.
 */

export const PAISE_PER_RUPEE = 100;
export const BPS_PER_PERCENT = 100;
export const DEFAULT_CURRENCY = 'INR';

export function asNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

export function rupeesToPaise(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return 0;
  const [whole, frac = ''] = text.split('.');
  return Number(whole) * PAISE_PER_RUPEE + Number((frac + '00').slice(0, 2));
}

export function paiseToRupeesText(paise) {
  const amount = asNonNegativeInt(paise);
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const rupees = Math.trunc(abs / PAISE_PER_RUPEE);
  const rem = abs % PAISE_PER_RUPEE;
  if (!rem) return `${sign}${rupees}`;
  return `${sign}${rupees}.${String(rem).padStart(2, '0')}`;
}

export function percentToBps(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return 0;
  const [whole, frac = ''] = text.split('.');
  return Number(whole) * BPS_PER_PERCENT + Number((frac + '00').slice(0, 2));
}

export function bpsToPercentText(bps) {
  const amount = asNonNegativeInt(bps);
  const whole = Math.trunc(amount / BPS_PER_PERCENT);
  const rem = amount % BPS_PER_PERCENT;
  if (!rem) return String(whole);
  return `${whole}.${String(rem).padStart(2, '0')}`;
}

export function applyPercentBps(amountPaise, percentBps) {
  const amount = BigInt(asNonNegativeInt(amountPaise));
  const bps = BigInt(asNonNegativeInt(percentBps));
  const product = amount * bps;
  const rounded = (product + 5000n) / 10000n;
  return Number(rounded);
}

export function clampPaise(amountPaise, maxPaise) {
  const amount = asNonNegativeInt(amountPaise);
  const max = asNonNegativeInt(maxPaise);
  if (!max) return amount;
  return amount > max ? max : amount;
}

export function formatInrPaise(paise) {
  const amount = asNonNegativeInt(paise);
  const rupees = Math.trunc(amount / PAISE_PER_RUPEE);
  const rem = amount % PAISE_PER_RUPEE;
  const formatted = rupees.toLocaleString('en-IN');
  if (!rem) return `₹${formatted}`;
  return `₹${formatted}.${String(rem).padStart(2, '0')}`;
}
