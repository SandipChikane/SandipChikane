const OPEN_WITHDRAWALS = new Set(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING']);

export function computeBalances({ commissions = [], withdrawals = [] } = {}) {
  const pending = sumBy(commissions, (row) => row.status === 'PENDING' && !row.fraudHold, 'commissionPaise');
  const availableRaw = sumBy(commissions, (row) => row.status === 'AVAILABLE' && !row.fraudHold, 'commissionPaise');
  const reserved = sumBy(withdrawals, (row) => OPEN_WITHDRAWALS.has(row.status), 'amountPaise');
  const paid = sumBy(withdrawals, (row) => row.status === 'PAID', 'amountPaise')
    + sumBy(commissions, (row) => row.status === 'PAID', 'commissionPaise');
  const reversed = sumBy(commissions, (row) => row.status === 'REVERSED', 'commissionPaise');
  const available = Math.max(0, availableRaw - reserved);
  return {
    pending,
    available,
    reserved,
    paid,
    reversed,
    availableRaw,
  };
}

export function proportionalReversePaise(commissionPaise, refundedPaise, originalPaidPaise) {
  const commission = Math.max(0, Number(commissionPaise) || 0);
  const refunded = Math.max(0, Number(refundedPaise) || 0);
  const original = Math.max(0, Number(originalPaidPaise) || 0);
  if (!commission || !original) return 0;
  if (refunded >= original) return commission;
  return Number((BigInt(commission) * BigInt(refunded)) / BigInt(original));
}

function sumBy(rows, test, field) {
  return (rows || []).reduce((sum, row) => (test(row) ? sum + (Number(row[field]) || 0) : sum), 0);
}
