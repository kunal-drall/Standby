import { formatDuration, LoanState, parseShares, SHARE_DECIMALS, standbyMarketAbi } from '@standby/shared';
import { useEffect, useState } from 'react';
import { formatUnits, parseEventLogs, parseUnits } from 'viem';
import { ClaimCard } from '../components/Claims';
import { liveDue, LoansTable } from '../components/Loans';
import { TxButton, TxPanel, useTx } from '../components/Tx';
import {
  Amount,
  Badge,
  Card,
  cx,
  ErrorState,
  Explainer,
  Kpi,
  KpiRow,
  Num,
  PageHead,
  PartyHint,
  useFmt,
  useGate,
} from '../components/ui';
import { CONTRACTS } from '../config';
import { collateralValue, interestFor, navFresh, neededFor } from '../lib/derived';
import { formatTime, pct } from '../lib/format';
import { publicClientFor } from '../lib/clients';
import { useAsync } from '../lib/useAsync';
import { useData, useNow } from '../state/data';
import { useSettings } from '../state/settings';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

function OpenLoanCard() {
  const { snap } = useData();
  const { effectiveRpcUrl } = useSettings();
  const now = useNow();
  const f = useFmt();
  const tx = useTx();
  const [pledgeText, setPledgeText] = useState<string | null>(null);
  const [borrowText, setBorrowText] = useState<string | null>(null);

  const balance = snap?.party?.shares ?? 0n;
  const pledgeValue = pledgeText ?? (balance > 0n ? formatUnits(balance, SHARE_DECIMALS) : '');
  let collateral: bigint | null = null;
  try {
    collateral = pledgeValue.trim() === '' ? null : parseShares(pledgeValue);
  } catch {
    collateral = null;
  }
  const debounced = useDebounced(collateral, 250);
  const preview = useAsync(
    debounced !== null && debounced > 0n && CONTRACTS
      ? () =>
          publicClientFor(effectiveRpcUrl).readContract({
            address: (CONTRACTS as NonNullable<typeof CONTRACTS>).market,
            abi: standbyMarketAbi,
            functionName: 'previewLimits',
            args: [debounced],
          })
      : null,
    `${effectiveRpcUrl}|${debounced ?? ''}|${snap?.blockNumber ?? ''}`,
  );
  if (!snap || !CONTRACTS) return null;
  const c = CONTRACTS;

  const current =
    collateral !== null && debounced === collateral && preview.dataKey?.startsWith(`${effectiveRpcUrl}|${collateral}|`) ? preview.data : undefined;
  const [priceLimit, capacityLimit, maxBorrow] = current ?? [null, null, null];
  const borrowValue = borrowText ?? (maxBorrow !== null ? formatUnits(maxBorrow, snap.decimals) : '');
  let principal: bigint | null = null;
  try {
    principal = borrowValue.trim() === '' ? null : parseUnits(borrowValue.trim(), snap.decimals);
  } catch {
    principal = null;
  }

  const p = snap.params;
  const value = collateral !== null ? collateralValue(collateral, snap.nav) : 0n;
  const priceBinds = priceLimit !== null && capacityLimit !== null && priceLimit <= capacityLimit;
  const fresh = navFresh(snap, now);
  const interestToMaturity = principal !== null ? interestFor(principal, p.rateBps, p.loanTerm) : null;
  const dueAtEnd = principal !== null ? principal + interestFor(principal, p.rateBps, p.loanTerm + p.grace) : null;
  const needed = principal !== null ? neededFor(snap, principal) : null;

  return (
    <Card title="Borrow against shares">
      <div className="field">
        <label htmlFor="pledge">Shares to pledge</label>
        <div className="input-group input-lg">
          <input
            id="pledge"
            className="input"
            inputMode="decimal"
            value={pledgeValue}
            placeholder="0"
            onChange={(e) => setPledgeText(e.target.value)}
            aria-invalid={(pledgeValue !== '' && collateral === null) || undefined}
          />
          <button type="button" className="btn btn-link input-action" aria-label="Use all my shares" onClick={() => setPledgeText(formatUnits(balance, SHARE_DECIMALS))}>
            Max
          </button>
          <span className="input-suffix">{snap.assetSymbol}</span>
        </div>
        <span className="hint">
          You hold <Amount kind="shares" value={balance} tip="RestrictedAsset.balanceOf(active wallet)" /> · worth{' '}
          <Amount value={value} tip={`value = collateral × NAV = ${f.s(collateral ?? 0n)} × ${f.nav(snap.nav)}`} />
        </span>
      </div>

      <div className="limits" aria-live="polite">
        {preview.error && current === undefined ? (
          <ErrorState title="Could not preview limits" message={preview.error} />
        ) : (
          <>
            <div className={cx('limit', priceLimit !== null && priceBinds && 'limit-binding')}>
              <span className="limit-label">
                Price limit {priceLimit !== null && priceBinds && <Badge tone="accent">lower</Badge>}
              </span>
              {priceLimit !== null ? (
                <Amount
                  value={priceLimit}
                  tip={`priceLimit = maxLtv × NAV × collateral\n= ${pct(p.maxLtvBps)} × ${f.nav(snap.nav)} × ${f.s(collateral ?? 0n)}\n(previewLimits at the latest block)`}
                />
              ) : (
                <span className="muted">—</span>
              )}
            </div>
            <div className={cx('limit', capacityLimit !== null && !priceBinds && 'limit-binding')}>
              <span className="limit-label">
                Capacity limit {capacityLimit !== null && !priceBinds && <Badge tone="accent">lower</Badge>}
              </span>
              {capacityLimit !== null ? (
                <Amount
                  value={capacityLimit}
                  tip={`capacityLimit = largest principal p with needed(p) ≤ free bids\nneeded(p) = ceil(dueAt(maturity + grace) × 1e4 / (1e4 − haircut))\nfree = freeCapacity(now + ${formatDuration(p.loanTerm)} + ${formatDuration(p.grace)}) = ${f.u(snap.freeForNewLoan)}\np ≈ free × (1 − ${pct(p.haircutBps)}) / (1 + ${pct(p.rateBps)} × ${p.loanTerm + p.grace} s / 365 days)`}
                />
              ) : (
                <span className="muted">—</span>
              )}
            </div>
            <div className="limit limit-total">
              <span className="limit-label">Max borrow</span>
              {maxBorrow !== null ? (
                <Amount
                  value={maxBorrow}
                  tip={`maxBorrow = min(priceLimit, capacityLimit) = min(${f.u(priceLimit ?? 0n)}, ${f.u(capacityLimit ?? 0n)})`}
                />
              ) : (
                <span className="muted">{preview.loading ? 'checking…' : '—'}</span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="field">
        <label htmlFor="borrow">Borrow amount</label>
        <div className="input-group input-lg">
          <input
            id="borrow"
            className="input"
            inputMode="decimal"
            value={borrowValue}
            placeholder="0"
            onChange={(e) => setBorrowText(e.target.value)}
            aria-invalid={(borrowValue !== '' && principal === null) || undefined}
          />
          {maxBorrow !== null && (
            <button type="button" className="btn btn-link input-action" aria-label="Borrow the maximum" onClick={() => setBorrowText(null)}>
              Max
            </button>
          )}
          <span className="input-suffix">{f.sym}</span>
        </div>
        {principal !== null && maxBorrow !== null && principal > maxBorrow && (
          <span className="hint text-warning">Above max borrow: the loan will be rejected.</span>
        )}
        {principal !== null && principal > snap.cash && (
          <span className="hint text-warning">
            Pool cash is only <Amount value={snap.cash} tip="StandbyMarket.cash()" />.
          </span>
        )}
      </div>

      <dl className="summary">
        <div>
          <dt>Interest to maturity</dt>
          <dd>
            {interestToMaturity !== null ? (
              <Amount value={interestToMaturity} tip={`principal × ${pct(p.rateBps)} × ${formatDuration(p.loanTerm)} / 365 days (simple)`} />
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Bid USDT reserved</dt>
          <dd>
            {needed !== null && dueAtEnd !== null ? (
              <Amount
                value={needed}
                tip={`needed = ceil(dueAt(maturity + grace) × 1e4 / (1e4 − haircut))\n= ceil(${f.u(dueAtEnd)} / (1 − ${pct(p.haircutBps)}))\nreserved from the cheapest bids first`}
              />
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Matures</dt>
          <dd>
            <Num tip={`now + loanTerm (${formatDuration(p.loanTerm)}); settleable after a further ${formatDuration(p.grace)} grace`}>
              {formatTime(now + p.loanTerm)}
            </Num>
          </dd>
        </div>
        <div>
          <dt>Steps</dt>
          <dd className="muted">approve shares to the market, then open</dd>
        </div>
      </dl>
      {!fresh && <p className="hint text-warning">The NAV is stale, so new loans are blocked until the issuer posts one.</p>}
      {snap.paused && <p className="hint text-warning">The asset is paused, so new loans are blocked.</p>}

      <TxButton
        size="block"
        pending={tx.pending}
        disabled={tx.busy || collateral === null || principal === null}
        onClick={() => {
          if (collateral === null || principal === null) return;
          const col = collateral;
          const pr = principal;
          void tx.run('Open loan', async (send) => {
            const call = { label: 'Open loan', address: c.market, abi: standbyMarketAbi, functionName: 'openLoan', args: [col, pr] } as const;
            await send.preflight(call);
            await send.ensureAllowance({ token: c.asset, spender: c.market, amount: col, label: 'Approve shares for the market' });
            const receipt = await send.write(call);
            const ev = parseEventLogs({ abi: standbyMarketAbi, logs: receipt.logs, eventName: 'LoanOpened' })[0];
            setBorrowText(null);
            setPledgeText(null);
            return ev
              ? `Loan #${ev.args.loanId} opened: borrowed ${f.usdt(ev.args.principal)} against ${f.s(ev.args.collateral)} shares. Matures ${formatTime(ev.args.maturity)}.`
              : 'Loan opened.';
          });
        }}
      >
        Open loan
      </TxButton>
      <TxPanel state={tx.state} />
    </Card>
  );
}

export function Borrower() {
  const { snap } = useData();
  const { active } = useSettings();
  const now = useNow();
  const f = useFmt();
  const { gate } = useGate();
  const mine = snap && active ? snap.loans.filter((l) => l.borrower.toLowerCase() === active.address.toLowerCase()) : [];
  const open = mine.filter((l) => l.state === LoanState.Open);
  const dueTotal = snap ? open.reduce((s, l) => s + liveDue(snap, l, now).due, 0n) : 0n;
  const pledged = open.reduce((s, l) => s + l.collateral, 0n);

  return (
    <>
      <PageHead
        title="Borrower"
        lead="Pledge fund shares and borrow USDT up to the lower of a price limit and the bid capacity that backs your loan."
      />
      <PartyHint expected={['Borrower']} action="Loans are opened and repaid from the active wallet, which needs shares (HOLDER role)." />
      {gate ??
        (snap && (
          <>
            <KpiRow>
              <Kpi label="Shares held">
                <Amount kind="shares" value={snap.party?.shares ?? 0n} tip="RestrictedAsset.balanceOf(active wallet)" />
              </Kpi>
              <Kpi label="Held value">
                <Amount
                  value={collateralValue(snap.party?.shares ?? 0n, snap.nav)}
                  tip={`shares × NAV = ${f.s(snap.party?.shares ?? 0n)} × ${f.nav(snap.nav)}`}
                />
              </Kpi>
              <Kpi label="Pledged">
                <Amount kind="shares" value={pledged} tip="Σ collateral over your open loans" />
              </Kpi>
              <Kpi label="Due now" tone={open.length ? 'warning' : undefined}>
                <Amount value={dueTotal} tip={`Σ dueAt(now) over ${open.length} open loan(s); repay also pays commitment fees`} />
              </Kpi>
              <Kpi label="Wallet USDT">
                <Amount value={snap.party?.usdt ?? 0n} tip="USDT.balanceOf(active wallet)" />
              </Kpi>
            </KpiRow>
            <div className="split">
              <div className="split-main">
                <Explainer
                  doing={[
                    'Pledge shares. The price limit is max LTV × NAV × shares; the capacity limit is what free bid USDT covers after the haircut. You borrow up to the lower one.',
                    'Opening a loan reserves bid USDT until maturity plus grace, so buyers are committed for the whole loan.',
                    'Repay any time before settlement: principal plus simple interest to the second, plus a small commitment fee to the buyers.',
                  ]}
                  risks={[
                    'If you do not repay by maturity plus grace, anyone can settle: reserved bids buy your shares at their discount, and only the leftover comes back.',
                    'A stale NAV or a paused asset blocks new loans; a pause also blocks repayment until the issuer unpauses.',
                    'The amount due grows every second, so the approval includes a small buffer.',
                  ]}
                />
                <Card title="My loans" aside={<span className="muted small">newest first</span>}>
                  <LoansTable loans={mine} mode="borrower" />
                </Card>
              </div>
              <aside className="split-side">
                <OpenLoanCard />
                <ClaimCard />
              </aside>
            </div>
          </>
        ))}
    </>
  );
}
