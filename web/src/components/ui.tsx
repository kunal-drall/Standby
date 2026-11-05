// Building blocks shared by every page: numbers with formula tooltips, KPI tiles, cards, page
// states (loading, empty, error, not configured), explainers, badges and address cells.
import { addressUrl, formatNav, SHARE_DECIMALS } from '@standby/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CONTRACT_ENV, CONTRACT_LABEL, MISSING_CONTRACTS, CONTRACTS, PARTY_ENV } from '../config';
import { exactAmount, formatAmount, shortAddress } from '../lib/format';
import type { Party } from '../routes';
import { useData } from '../state/data';
import { useSettings } from '../state/settings';
import { Tip } from './Tip';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Formatting helpers bound to the live USDT decimals and the chosen number format. */
export function useFmt() {
  const { numberFormat } = useSettings();
  const { snap } = useData();
  const decimals = snap?.decimals ?? 0;
  const sym = snap?.usdtSymbol ?? 'USDT';
  return {
    decimals,
    sym,
    mode: numberFormat,
    /** "1,234.56 USDT" in the chosen format. */
    usdt: (v: bigint) => `${formatAmount(v, decimals, numberFormat)} ${sym}`,
    /** Full digits, for formulas. */
    u: (v: bigint) => formatAmount(v, decimals, 'full'),
    shares: (v: bigint) => formatAmount(v, SHARE_DECIMALS, numberFormat, 6),
    s: (v: bigint) => formatAmount(v, SHARE_DECIMALS, 'full', 6),
    nav: (v: bigint) => formatNav(v, decimals),
  };
}

type AmountProps = { value: bigint; tip: ReactNode; kind?: 'usdt' | 'shares' | 'pool'; className?: string };

/** An amount with its formula on hover/focus; adds the exact value when the display rounds. */
export function Amount({ value, tip, kind = 'usdt', className }: AmountProps) {
  const f = useFmt();
  const decimals = kind === 'shares' ? SHARE_DECIMALS : f.decimals;
  const unit = kind === 'shares' ? 'shares' : kind === 'pool' ? 'pool shares' : f.sym;
  const shown = kind === 'shares' ? f.shares(value) : formatAmount(value, decimals, f.mode);
  const exact = exactAmount(value, decimals);
  return (
    <Tip
      className={cx('num', className)}
      tip={
        <>
          {tip}
          {shown !== exact && <span className="tip-exact">Exact: {exact} {unit}</span>}
        </>
      }
    >
      {shown} <span className="unit">{unit}</span>
    </Tip>
  );
}

/** Any other number (percent, count, time) with its source on hover/focus. */
export function Num({ children, tip, className }: { children: ReactNode; tip: ReactNode; className?: string }) {
  return (
    <Tip className={cx('num', className)} tip={tip}>
      {children}
    </Tip>
  );
}

export function Kpi({
  label,
  children,
  sub,
  tone,
}: {
  label: string;
  children: ReactNode;
  sub?: ReactNode;
  tone?: 'positive' | 'warning' | 'negative' | 'accent';
}) {
  return (
    <div className={cx('kpi', tone && `kpi-${tone}`)}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{children}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="kpi-row">{children}</div>;
}

export function Card({
  title,
  children,
  aside,
  className,
  id,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = `card-${(id ?? title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className={cx('card', className)} aria-labelledby={headingId}>
      <div className="card-head">
        <h2 id={headingId}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function PageHead({ title, lead, children }: { title: string; lead: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p className="lead">{lead}</p>
      </div>
      {children}
    </div>
  );
}

export function Loading({ label = 'Loading from the chain…' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function SkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <div className="kpi-row" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="kpi skeleton">
          <div className="sk-line short" />
          <div className="sk-line" />
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Could not read the chain', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <strong>{title}</strong>
      <div className="mono-wrap">{message}</div>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="state state-warning" role="status">
      <strong>Contracts not deployed or not configured</strong>
      <p>
        The app needs the addresses below. Run the deploy script (it writes{' '}
        <code>packages/shared/src/deployments.json</code>) or set the <code>VITE_*</code> variables and rebuild.
      </p>
      <ul className="plain-list">
        {MISSING_CONTRACTS.map((k) => (
          <li key={k}>
            {CONTRACT_LABEL[k]}: <code>{CONTRACT_ENV[k]}</code> missing
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Common gate for live pages: not configured, first load, read error. Renders children with a
 * snapshot otherwise.
 */
export function useGate(): { gate: ReactNode | null } {
  const { snap, error, loading, refresh } = useData();
  if (!CONTRACTS) return { gate: <NotConfigured /> };
  if (!snap && error) return { gate: <ErrorState message={error} onRetry={() => void refresh()} /> };
  if (!snap) return { gate: <><SkeletonRow /><Loading label={loading ? 'Loading from the chain…' : 'Waiting for the chain…'} /></> };
  return { gate: null };
}

export function StaleBanner() {
  const { snap, error } = useData();
  if (!snap || !error) return null;
  return (
    <div className="banner banner-warning" role="status">
      Showing data from block {snap.blockNumber.toString()}; the latest read failed: {error}
    </div>
  );
}

export function Explainer({ doing, risks }: { doing: ReactNode[]; risks: ReactNode[] }) {
  return (
    <section className="card explainer" aria-label="How this page works">
      <div className="explainer-grid">
        <div>
          <h3>What you do here</h3>
          <ul>
            {doing.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>What can go wrong</h3>
          <ul>
            {risks.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'info' | 'accent'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/** Party label (if known) plus a short address linking to the explorer; full address on hover. */
export function AddressCell({ address, label }: { address: string; label?: string | null }) {
  const { labelOf } = useSettings();
  const name = label ?? labelOf(address) ?? contractLabel(address);
  return (
    <Tip tip={<span className="mono-wrap">{address}</span>} focusable={false}>
      <a className="addr" href={addressUrl(address)} target="_blank" rel="noreferrer">
        {name && <span className="addr-name">{name}</span>}
        <span className="mono">{shortAddress(address)}</span>
      </a>
    </Tip>
  );
}

export function contractLabel(address: string): string | null {
  if (!CONTRACTS) return null;
  const lower = address.toLowerCase();
  for (const [key, value] of Object.entries(CONTRACTS)) {
    if (value.toLowerCase() === lower) return CONTRACT_LABEL[key as keyof typeof CONTRACT_LABEL];
  }
  return null;
}

/** Warns when the active wallet is not one of the parties this page is for, or has no key. */
export function PartyHint({ expected, action }: { expected: Party[]; action: string }) {
  const { party, active, setParty, wallets } = useSettings();
  if (!active) {
    return (
      <div className="banner banner-warning" role="status">
        No key for <strong>{party}</strong>. Set <code>{PARTY_ENV[party]}</code> at build time or paste a testnet key in{' '}
        <Link to="/settings">Settings</Link>.
      </div>
    );
  }
  if (expected.includes(party)) return null;
  return (
    <div className="banner banner-info" role="status">
      You are acting as <strong>{party}</strong>. {action}{' '}
      {expected
        .filter((p) => wallets[p])
        .map((p) => (
          <button key={p} type="button" className="btn btn-link" onClick={() => setParty(p)}>
            Act as {p}
          </button>
        ))}
    </div>
  );
}

/** Horizontal stacked bar (inline SVG) with a legend; each segment has its own tooltip. */
export function StackBar({
  segments,
  label,
}: {
  segments: { key: string; label: string; value: bigint; tone: 'accent' | 'positive' | 'muted' | 'warning'; tip: ReactNode }[];
  label: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0n);
  const width = 1000;
  const gap = 4;
  let x = 0;
  const visible = segments.filter((s) => s.value > 0n);
  const parts = visible.map((s, i) => {
    const w = total > 0n ? Number((s.value * 1_000_000n) / total) / 1_000_000 : 0;
    const px = w * width;
    const rect = { ...s, x: x + (i > 0 ? gap / 2 : 0), w: Math.max(px - (i > 0 ? gap / 2 : 0) - (i < visible.length - 1 ? gap / 2 : 0), 2) };
    x += px;
    return rect;
  });
  return (
    <figure className="stackbar">
      <svg viewBox={`0 0 ${width} 28`} preserveAspectRatio="none" role="img" aria-label={label} className="stackbar-svg">
        <rect x="0" y="0" width={width} height="28" rx="6" className="seg-track" />
        {parts.map((p) => (
          <rect key={p.key} x={p.x} y="0" width={p.w} height="28" rx="4" className={`seg seg-${p.tone}`}>
            <title>{p.label}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="legend">
        {segments.map((s) => (
          <span key={s.key} className="legend-item">
            <span className={`swatch seg-${s.tone}`} aria-hidden="true" />
            {s.label}: <Amount value={s.value} tip={s.tip} />
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Small inline bar for one row: reserved vs free. */
export function MiniBar({ reserved, total, label }: { reserved: bigint; total: bigint; label: string }) {
  const ratio = total > 0n ? Number((reserved * 10_000n) / total) / 10_000 : 0;
  const r = ratio * 100;
  const gap = ratio > 0 && ratio < 1 ? 1.5 : 0;
  return (
    <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="minibar" role="img" aria-label={label}>
      {total === 0n && <rect x="0" y="0" width="100" height="8" rx="3" className="seg-track" />}
      {ratio > 0 && <rect x="0" y="0" width={Math.max(r - gap / 2, 1.5)} height="8" rx="2" className="seg-accent" />}
      {ratio < 1 && total > 0n && (
        <rect x={r + gap / 2} y="0" width={Math.max(100 - r - gap / 2, 1.5)} height="8" rx="2" className="seg-positive" />
      )}
    </svg>
  );
}
