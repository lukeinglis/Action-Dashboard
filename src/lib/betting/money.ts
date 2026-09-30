// Money helpers. See docs/PRD.md section 25.
//
// All amounts are stored as integer cents in a Postgres bigint.
// totalReturnCents is entered as shown on the slip and is never derived.

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${centsToDollars(Math.abs(cents)).toFixed(2)}`;
}

/**
 * For a non-bonus ticket, the return should equal stake plus to-win. A
 * mismatch is shown as a warning but never blocks the save (docs/PRD.md
 * section 25). Bonus bets are exempt: the stake isn't returned.
 */
export function hasReturnMismatch(ticket: {
  stakeCents: number;
  toWinCents: number;
  totalReturnCents: number;
  isBonusBet: boolean;
}): boolean {
  if (ticket.isBonusBet) return false;
  return ticket.totalReturnCents !== ticket.stakeCents + ticket.toWinCents;
}
