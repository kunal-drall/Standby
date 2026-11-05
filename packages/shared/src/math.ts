// Off-chain mirrors of the formulas in docs/interfaces.md section 5 ("Math"), for previews and
// tooltips. The contracts are the source of truth: when a view exists (previewLimits, due,
// isSettleable), read it instead of recomputing.
import { BPS, WAD, YEAR_SECONDS } from './units.js';

function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new Error('Division by zero');
  return a === 0n ? 0n : (a - 1n) / b + 1n;
}

/** value = collateral * nav / 1e18 (USDT base units). */
export function collateralValue(collateral: bigint, nav: bigint): bigint {
  return (collateral * nav) / WAD;
}

/** priceLimit = value * maxLtvBps / 1e4. */
export function priceLimit(value: bigint, maxLtvBps: number): bigint {
  return (value * BigInt(maxLtvBps)) / BPS;
}

/** dueAt(t) = principal + principal * rateBps * elapsed / (1e4 * 365 days). Simple interest. */
export function dueAfter(principal: bigint, rateBps: number, elapsedSeconds: bigint): bigint {
  if (elapsedSeconds < 0n) throw new Error('Negative elapsed time');
  return principal + (principal * BigInt(rateBps) * elapsedSeconds) / (BPS * YEAR_SECONDS);
}

/** needed = ceil(due * 1e4 / (1e4 - haircutBps)): bid USDT a loan must reserve. */
export function neededCapacity(due: bigint, haircutBps: number): bigint {
  return ceilDiv(due * BPS, BPS - BigInt(haircutBps));
}

/** A bid's price per 1e18 shares: nav * (1e4 - discountBps) / 1e4. */
export function bidPrice(nav: bigint, discountBps: number): bigint {
  return (nav * (BPS - BigInt(discountBps))) / BPS;
}

/** Shares delivered for `take` USDT at `price`: ceil(take * 1e18 / price). */
export function sharesForUsdt(take: bigint, price: bigint): bigint {
  return ceilDiv(take * WAD, price);
}
