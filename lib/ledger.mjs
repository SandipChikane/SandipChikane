const OPEN_WITHDRAWALS = new Set(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING']);

function remainingPaise(row) {
  const awarded = Number(row?.commissionPaise) || 0;
  const reversed = Number(row?.reversedPaise) || 0;
  return Math.max(0, awarded - reversed);
}

export function computeBalances({ commissions = [], withdrawals = [] } = {}) {
  const pending = (commissions || []).reduce((sum, row) => (
    row.status === 'PENDING' && !row.fraudHold ? sum + remainingPaise(row) : sum
  ), 0);
  const availableRaw = (commissions || []).reduce((sum, row) => (
    row.status === 'AVAILABLE' && !row.fraudHold ? sum + remainingPaise(row) : sum
  ), 0);
  const reserved = sumBy(withdrawals, (row) => OPEN_WITHDRAWALS.has(row.status), 'amountPaise');
  const paid = sumBy(withdrawals, (row) => row.status === 'PAID', 'amountPaise')
    + (commissions || []).reduce((sum, row) => (
      row.status === 'PAID' ? sum + remainingPaise(row) : sum
    ), 0);
  const reversed = (commissions || []).reduce((sum, row) => {
    if (row.status === 'REVERSED') return sum + (Number(row.commissionPaise) || 0);
    return sum + (Number(row.reversedPaise) || 0);
  }, 0);
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
