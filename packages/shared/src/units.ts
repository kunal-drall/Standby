// Units from docs/interfaces.md section 3.
// - USDT: token base units, decimals read at runtime (never assume 6).
// - Asset shares: 18 decimals.
// - NAV: USDT base units per 1e18 share units (NAV 1.02 with 6 decimals = 1_020_000n).
// - Basis points: 10_000 = 100%.
// - Time: seconds.
import { formatUnits, parseUnits } from 'viem';

export const SHARE_DECIMALS = 18;
export const WAD = 10n ** 18n;
export const BPS = 10_000n;
export const YEAR_SECONDS = 365n * 24n * 60n * 60n;

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`Invalid token decimals: ${decimals}`);
  }
}

/** "12.5" -> base units, for a token with `decimals` read from the chain. */
export function parseUsdt(text: string, decimals: number): bigint {
  assertDecimals(decimals);
  return parseUnits(text.trim(), decimals);
}

/** Base units -> decimal string without trailing zeros. */
export function formatUsdt(amount: bigint, decimals: number): string {
  assertDecimals(decimals);
  return formatUnits(amount, decimals);
}

export function parseShares(text: string): bigint {
  return parseUnits(text.trim(), SHARE_DECIMALS);
}

export function formatShares(amount: bigint): string {
  return formatUnits(amount, SHARE_DECIMALS);
}

/** NAV quoted in USDT per whole share ("1.02") -> on-chain NAV (USDT base units per 1e18 shares). */
export function parseNav(text: string, usdtDecimals: number): bigint {
  return parseUsdt(text, usdtDecimals);
}

/** On-chain NAV -> USDT per whole share. */
export function formatNav(nav: bigint, usdtDecimals: number): string {
  return formatUsdt(nav, usdtDecimals);
}

/** 850 -> "8.5%". */
export function formatBps(bps: number | bigint): string {
  const value = Number(bps);
  if (!Number.isFinite(value)) throw new Error(`Invalid bps: ${bps}`);
  return `${Number((value / 100).toFixed(2))}%`;
}

/** "8.5" (percent) -> 850. Rejects values that are not whole basis points or exceed 100%. */
export function percentToBps(percent: string): number {
  const bps = Math.round(Number(percent.trim()) * 100);
  if (!Number.isFinite(bps) || bps < 0 || bps > 10_000 || Math.abs(Number(percent) * 100 - bps) > 1e-9) {
    throw new Error(`Invalid percent: ${percent}`);
  }
  return bps;
}

/** Seconds -> "10 min", "1 h 5 min", "45 s". For notice periods and countdowns. */
export function formatDuration(seconds: number | bigint): string {
  let s = Math.max(0, Math.floor(Number(seconds)));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} d`);
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (s || parts.length === 0) parts.push(`${s} s`);
  return parts.slice(0, 2).join(' ');
}
