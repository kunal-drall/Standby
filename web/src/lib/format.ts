// Display formatting. Amounts stay bigint until the last step; "full" keeps every digit up to a
// cap, "compact" rounds for dense tiles. Locale is fixed so tooltips and formulas read the same.
import { formatBps, formatDuration, SHARE_DECIMALS } from '@standby/shared';
import { formatUnits } from 'viem';

export type NumberFormat = 'compact' | 'full';

const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const smallFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Base units -> "1,234.5678" (full, at most `maxFrac` fraction digits, truncated) or "1.23K" (compact). */
export function formatAmount(value: bigint, decimals: number, mode: NumberFormat = 'full', maxFrac = 6): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const text = formatUnits(abs, decimals);
  const sign = negative ? '−' : '';
  if (mode === 'compact') {
    const n = Number(text);
    return sign + (n >= 10_000 ? compactFmt.format(n) : smallFmt.format(n));
  }
  const [intPart = '0', frac = ''] = text.split('.');
  const shown = frac.slice(0, maxFrac).replace(/0+$/, '');
  return sign + group(intPart) + (shown ? `.${shown}` : '');
}

/** Every digit, for tooltips. */
export function exactAmount(value: bigint, decimals: number): string {
  return formatAmount(value, decimals, 'full', decimals);
}

export function formatShareAmount(value: bigint, mode: NumberFormat = 'full'): string {
  return formatAmount(value, SHARE_DECIMALS, mode, 6);
}

export function formatInt(value: bigint | number): string {
  return group(String(value));
}

export function pct(bps: number | bigint): string {
  return formatBps(bps);
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Unix seconds -> "5 Nov, 14:32:05" in the viewer's time zone. */
export function formatTime(seconds: number | bigint): string {
  return dateTime.format(new Date(Number(seconds) * 1000));
}

/** "in 9 min 32 s" or "2 min ago". */
export function relative(target: number, now: number): string {
  if (target > now) return `in ${formatDuration(target - now)}`;
  return `${formatDuration(now - target)} ago`;
}

export { formatDuration };
