import { formatDuration, txUrl } from '@standby/shared';
import { useMemo, useState, type ReactNode } from 'react';
import { zeroAddress } from 'viem';
import { contractLabel, Empty, ErrorState, Loading, Num, PageHead, useFmt } from '../components/ui';
import { CONTRACT_LABEL, CONTRACTS, START_BLOCK } from '../config';
import { formatInt, formatTime, pct, shortAddress } from '../lib/format';
import { useBlockTimes, useLogs, type ActivityLog, type EventContract } from '../lib/logs';
import { useData } from '../state/data';
import { useSettings } from '../state/settings';
import { rolesText } from './Issuer';
import { NotConfigured } from '../components/ui';

const PAGE = 50;

type Describe = (log: ActivityLog) => ReactNode;

function useDescribe(): Describe {
  const f = useFmt();
  const { labelOf } = useSettings();
  const { snap } = useData();
  const who = (a: unknown) => {
    const s = String(a);
    return labelOf(s) ?? contractLabel(s) ?? shortAddress(s);
  };
  const usdt = (v: unknown) => (snap ? f.usdt(v as bigint) : `${String(v)} base units`);
  const shares = (v: unknown) => `${f.s(v as bigint)} shares`;

  return (log) => {
    const a = log.args;
    switch (log.eventName) {
      case 'RolesSet':
        return Number(a.roles) === 0 ? `Issuer removed ${who(a.account)} from the allowlist` : `Issuer set ${who(a.account)} roles to ${rolesText(Number(a.roles))}`;
      case 'PauseSet':
        return a.paused ? 'Issuer paused all share movements' : 'Issuer unpaused the asset';
      case 'Transfer':
        if (String(a.from) === zeroAddress) return `Minted ${shares(a.value)} to ${who(a.to)}`;
        if (String(a.to) === zeroAddress) return `Burned ${shares(a.value)} from ${who(a.from)}`;
        return `${shares(a.value)} moved from ${who(a.from)} to ${who(a.to)}`;
      case 'Approval':
        return `${who(a.owner)} approved ${who(a.spender)} for ${shares(a.value)}`;
      case 'NavPosted':
        return `Issuer posted NAV ${snap ? f.nav(a.nav as bigint) : String(a.nav)} ${f.sym} per share`;
      case 'MarketSet':
        return `Bid book linked to the market ${shortAddress(String(a.market))}`;
      case 'BidPosted':
        return `${who(a.buyer)} posted bid #${String(a.bidId)}: ${usdt(a.amount)} at ${pct(Number(a.discountBps))} discount, ${formatDuration(Number(a.notice))} notice`;
      case 'ExitRequested':
        return `Bid #${String(a.bidId)} requested exit; unlocks ${formatTime(Number(a.exitAt))}`;
      case 'BidWithdrawn':
        return `Bid #${String(a.bidId)} withdrew ${usdt(a.amount)}`;
      case 'Reserved':
        return `Loan #${String(a.loanId)} reserved ${usdt(a.amount)} of bid #${String(a.bidId)}`;
      case 'Released':
        return `Released ${usdt(a.amount)} back to bid #${String(a.bidId)}`;
      case 'Evicted':
        return `Bid #${String(a.bidId)} evicted (buyer lost the BUYER role): ${usdt(a.refunded)} refunded to the buyer`;
      case 'Filled':
        return `Bid #${String(a.bidId)} paid ${usdt(a.usdtAmount)} for defaulted collateral`;
      case 'Deposited':
        return `${who(a.lender)} deposited ${usdt(a.assets)} for ${snap ? f.u(a.shares as bigint) : String(a.shares)} pool shares`;
      case 'Withdrawn':
        return `${who(a.lender)} redeemed ${snap ? f.u(a.shares as bigint) : String(a.shares)} pool shares for ${usdt(a.assets)}`;
      case 'LoanOpened':
        return `${who(a.borrower)} opened loan #${String(a.loanId)}: ${usdt(a.principal)} against ${shares(a.collateral)}, matures ${formatTime(Number(a.maturity))}`;
      case 'LoanRepaid':
        return `Loan #${String(a.loanId)} repaid: ${usdt(a.paid)} to the pool, ${usdt(a.commitmentFees)} commitment fees to buyers`;
      case 'LoanSettled':
        return `Loan #${String(a.loanId)} settled: ${usdt(a.recovered)} recovered, ${shares(a.collateralToBuyers)} to buyers, ${shares(a.collateralReturned)} returned`;
      case 'SharesHeld':
        return `Market is holding ${shares(a.shares)} for ${who(a.account)} until it is allowlisted again`;
      case 'SharesClaimed':
        return `${who(a.account)} claimed ${shares(a.shares)} held by the market`;
      case 'FeeHeld':
        return `Market is holding a ${usdt(a.amount)} commitment fee for ${who(a.buyer)}`;
      case 'FeesClaimed':
        return `${who(a.buyer)} claimed ${usdt(a.amount)} of commitment fees`;
      case 'Shortfall':
        return `Loan #${String(a.loanId)} settled short by ${usdt(a.amount)}`;
      default:
        return log.eventName;
    }
  };
}

const FILTERS: { key: 'all' | EventContract; label: string }[] = [
  { key: 'all', label: 'All contracts' },
  { key: 'market', label: CONTRACT_LABEL.market },
  { key: 'bidBook', label: CONTRACT_LABEL.bidBook },
  { key: 'asset', label: CONTRACT_LABEL.asset },
  { key: 'registry', label: CONTRACT_LABEL.registry },
  { key: 'oracle', label: CONTRACT_LABEL.oracle },
];

export function Activity() {
  const { effectiveRpcUrl } = useSettings();
  const logs = useLogs(effectiveRpcUrl);
  const describe = useDescribe();
  const [filter, setFilter] = useState<'all' | EventContract>('all');
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const list = filter === 'all' ? logs.logs : logs.logs.filter((l) => l.contract === filter);
    return [...list].sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : Number(b.blockNumber - a.blockNumber)));
  }, [logs.logs, filter]);
  const shown = rows.slice(0, limit);
  const times = useBlockTimes(effectiveRpcUrl, [...new Set(shown.map((l) => l.blockNumber))]);

  const progress =
    logs.latest !== null && logs.scannedTo !== null && logs.latest > START_BLOCK
      ? Math.min(100, Number(((logs.scannedTo - START_BLOCK) * 100n) / (logs.latest - START_BLOCK)))
      : null;

  return (
    <>
      <PageHead title="Activity" lead="Every event from the five Standby contracts, newest first, read straight from the chain." />
      {!CONTRACTS ? (
        <NotConfigured />
      ) : (
        <section className="card" aria-label="Events">
          <div className="toolbar">
            <label className="field-inline">
              <span>Contract</span>
              <select className="input input-sm" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                {FILTERS.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted small">
              <Num tip={`eth_getLogs from block ${formatInt(START_BLOCK)} (start block) in chunks of at most 5,000 blocks, rescanned every 6 s`}>
                {logs.scannedTo !== null ? `Scanned to block ${formatInt(logs.scannedTo)}` : 'Scanning…'}
                {logs.scanning && progress !== null && progress < 100 ? ` (${progress}%)` : ''}
              </Num>{' '}
              · {formatInt(rows.length)} events
            </span>
          </div>
          {logs.error && <ErrorState title="Could not read events" message={logs.error} onRetry={() => void logs.rescan()} />}
          {logs.scannedTo === null && !logs.error ? (
            <Loading label="Scanning event logs…" />
          ) : rows.length === 0 && !logs.error ? (
            <Empty title="No events yet">Events appear here as parties act.</Empty>
          ) : (
            <>
              <ol className="feed">
                {shown.map((l) => {
                  const t = times.get(l.blockNumber);
                  return (
                    <li key={l.id} className="feed-item">
                      <div className="feed-meta">
                        <span className={`tag tag-${l.contract}`}>{l.eventName}</span>
                        <span className="muted small">{CONTRACT_LABEL[l.contract]}</span>
                      </div>
                      <div className="feed-text">{describe(l)}</div>
                      <div className="feed-side small">
                        <Num tip={`Block ${formatInt(l.blockNumber)}, log index ${l.logIndex}`}>#{formatInt(l.blockNumber)}</Num>
                        <span className="muted">{t ? formatTime(t) : '…'}</span>
                        <a href={txUrl(l.txHash)} target="_blank" rel="noreferrer" aria-label={`Transaction ${l.txHash} on the explorer`}>
                          tx ↗
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {rows.length > limit && (
                <button type="button" className="btn btn-secondary" onClick={() => setLimit((n) => n + PAGE)}>
                  Show older events
                </button>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
