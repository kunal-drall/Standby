// Aggregates computed from a snapshot, plus helpers to write formulas into tooltips.
import { BPS, bidPrice, collateralValue, dueAfter, neededCapacity, YEAR_SECONDS } from '@standby/shared';
import type { BidView, LoanView, Snapshot } from './snapshot';

export function openBids(snap: Snapshot): BidView[] {
  const byId = new Map(snap.bids.map((b) => [b.id, b]));
  return snap.openBidIds.map((id) => byId.get(id)).filter((b): b is BidView => b !== undefined);
}

export function bidTotals(snap: Snapshot) {
  const open = openBids(snap);
  const committed = open.reduce((s, b) => s + b.amount, 0n);
  const reserved = open.reduce((s, b) => s + b.reserved, 0n);
  const free = snap.freeForNewLoan;
  const unreserved = committed - reserved;
  const unavailable = unreserved > free ? unreserved - free : 0n;
  return { open, committed, reserved, free, unreserved, unavailable };
}

export function openLoans(snap: Snapshot): LoanView[] {
  return snap.loans.filter((l) => l.state === 1);
}

export function interestAccrued(snap: Snapshot): bigint {
  const v = snap.totalAssets - snap.cash - snap.totalPrincipal;
  return v > 0n ? v : 0n;
}

/** "a + b + c" for up to `max` terms, then "+ … (n more)". */
export function sumTerms(values: string[], max = 6): string {
  if (values.length === 0) return '0';
  const shown = values.slice(0, max).join(' + ');
  return values.length > max ? `${shown} + … (${values.length - max} more)` : shown;
}

export function navFresh(snap: Snapshot, now: number): boolean {
  return snap.navUpdatedAt !== 0 && now - snap.navUpdatedAt <= snap.params.maxNavAge;
}

/** Does this open bid back a loan that ends at `until` (not in exit, or unlocks after it)? */
export function backsUntil(bid: BidView, until: number): boolean {
  return bid.exitAt === 0 || bid.exitAt > until;
}

export function priceOf(snap: Snapshot, discountBps: number): bigint {
  return bidPrice(snap.nav, discountBps);
}

/** Local mirror of the market's needed(), for previews. */
export function neededFor(snap: Snapshot, principal: bigint): bigint {
  const due = dueAfter(principal, snap.params.rateBps, BigInt(snap.params.loanTerm + snap.params.grace));
  return neededCapacity(due, snap.params.haircutBps);
}

export function interestFor(principal: bigint, rateBps: number, seconds: number): bigint {
  return (principal * BigInt(rateBps) * BigInt(Math.max(0, Math.floor(seconds)))) / (BPS * YEAR_SECONDS);
}

export function feeFor(reserved: bigint, commitFeeBps: number, seconds: number): bigint {
  return (reserved * BigInt(commitFeeBps) * BigInt(Math.max(0, Math.floor(seconds)))) / (BPS * YEAR_SECONDS);
}

export { collateralValue };
