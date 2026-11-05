import { standbyMarketAbi } from '@standby/shared';
import { useState } from 'react';
import { formatUnits, parseEventLogs, parseUnits } from 'viem';
import { LoansTable } from '../components/Loans';
import { TxButton, TxPanel, useTx } from '../components/Tx';
import {
  Amount,
  Card,
  Empty,
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
import { interestAccrued, openLoans } from '../lib/derived';
import { formatInt, formatTime } from '../lib/format';
import { useBlockTimes, useLogs } from '../lib/logs';
import type { Snapshot } from '../lib/snapshot';
import { useData } from '../state/data';
import { useSettings } from '../state/settings';

function parseAmount(text: string, decimals: number): bigint | null {
  try {
    const v = parseUnits(text.trim(), decimals);
    return v >= 0n ? v : null;
  } catch {
    return null;
  }
}

/** USDT per pool share = (totalAssets + 1) / (totalShares + 1), as a decimal string. */
function sharePrice(snap: Snapshot): string {
  const scaled = ((snap.totalAssets + 1n) * 10n ** 18n) / (snap.totalShares + 1n);
  const [i, frac = ''] = formatUnits(scaled, 18).split('.');
  const shown = frac.slice(0, 6).padEnd(6, '0');
  return `${i}.${shown}`;
}

function DepositCard() {
  const { snap } = useData();
  const f = useFmt();
  const tx = useTx();
  const [text, setText] = useState('100');
  if (!snap || !CONTRACTS) return null;
  const c = CONTRACTS;
  const amount = parseAmount(text, snap.decimals);
  const preview = amount !== null ? (amount * (snap.totalShares + 1n)) / (snap.totalAssets + 1n) : null;
  const balance = snap.party?.usdt ?? 0n;
  const tooMuch = amount !== null && snap.party !== null && amount > balance;

  return (
    <Card title="Deposit USDT">
      <div className="field">
        <label htmlFor="deposit-amount">Deposit amount</label>
        <div className="input-group input-lg">
          <input
            id="deposit-amount"
            className="input"
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={amount === null || undefined}
          />
          <span className="input-suffix">{f.sym}</span>
        </div>
        <span className="hint">
          Wallet: <Amount value={balance} tip="USDT.balanceOf(active wallet)" />
          {tooMuch && <span className="text-warning"> · more than the wallet holds</span>}
        </span>
      </div>
      <dl className="summary">
        <div>
          <dt>You receive</dt>
          <dd>
            {preview !== null ? (
              <Amount
                kind="pool"
                value={preview}
                tip={`shares = assets × (totalShares + 1) / (totalAssets + 1), rounded down\n= ${f.u(amount ?? 0n)} × (${formatInt(snap.totalShares)} + 1) / (${formatInt(snap.totalAssets)} + 1) in base units`}
              />
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Steps</dt>
          <dd className="muted">approve USDT to the market, then deposit</dd>
        </div>
      </dl>
      <TxButton
        size="block"
        pending={tx.pending}
        disabled={tx.busy || amount === null || amount === 0n}
        onClick={() => {
          if (amount === null) return;
          void tx.run('Deposit', async (send) => {
            const call = { label: 'Deposit', address: c.market, abi: standbyMarketAbi, functionName: 'deposit', args: [amount] } as const;
            await send.preflight(call);
            await send.ensureAllowance({ token: c.usdt, spender: c.market, amount, label: 'Approve USDT for the market' });
            const receipt = await send.write(call);
            const ev = parseEventLogs({ abi: standbyMarketAbi, logs: receipt.logs, eventName: 'Deposited' })[0];
            return ev ? `Deposited ${f.usdt(ev.args.assets)} for ${f.u(ev.args.shares)} pool shares.` : 'Deposited.';
          });
        }}
      >
        Deposit
      </TxButton>
      <TxPanel state={tx.state} />
    </Card>
  );
}

function WithdrawCard() {
  const { snap } = useData();
  const f = useFmt();
  const tx = useTx();
  const [text, setText] = useState('');
  if (!snap || !CONTRACTS) return null;
  const c = CONTRACTS;
  const mine = snap.party?.poolShares ?? 0n;
  const shares = text.trim() === '' ? null : parseAmount(text, snap.decimals);
  const assets = shares !== null ? (shares * (snap.totalAssets + 1n)) / (snap.totalShares + 1n) : null;
  const short = assets !== null && assets > snap.cash;

  return (
    <Card title="Withdraw USDT">
      <div className="field">
        <label htmlFor="withdraw-shares">Shares to withdraw</label>
        <div className="input-group input-lg">
          <input
            id="withdraw-shares"
            className="input"
            inputMode="decimal"
            placeholder="0"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="button" className="btn btn-link input-action" onClick={() => setText(formatUnits(mine, snap.decimals))} aria-label="Use all my pool shares">
            Max
          </button>
          <span className="input-suffix">pool shares</span>
        </div>
        <span className="hint">
          You hold <Amount kind="pool" value={mine} tip="StandbyMarket.sharesOf(active wallet)" />
        </span>
      </div>
      <dl className="summary">
        <div>
          <dt>You receive</dt>
          <dd>
            {assets !== null ? (
              <Amount
                value={assets}
                tip={`assets = shares × (totalAssets + 1) / (totalShares + 1), rounded down\n= ${formatInt(shares ?? 0n)} × (${formatInt(snap.totalAssets)} + 1) / (${formatInt(snap.totalShares)} + 1) base units`}
              />
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Pool cash</dt>
          <dd>
            <Amount value={snap.cash} tip="StandbyMarket.cash(): withdrawals are paid from idle USDT only" />
          </dd>
        </div>
      </dl>
      {short && <p className="hint text-warning">The pool has less idle cash than this; the rest is lent out until loans are repaid or settled.</p>}
      <TxButton
        size="block"
        variant="secondary"
        pending={tx.pending}
        disabled={tx.busy || shares === null}
        onClick={() => {
          if (shares === null) return;
          void tx.run('Withdraw shares', async (send) => {
            const receipt = await send.write({ label: 'Withdraw', address: c.market, abi: standbyMarketAbi, functionName: 'withdraw', args: [shares] });
            const ev = parseEventLogs({ abi: standbyMarketAbi, logs: receipt.logs, eventName: 'Withdrawn' })[0];
            return ev ? `Redeemed ${f.u(ev.args.shares)} pool shares for ${f.usdt(ev.args.assets)}.` : 'Withdrawn.';
          });
          setText('');
        }}
      >
        Withdraw shares
      </TxButton>
      <TxPanel state={tx.state} />
    </Card>
  );
}

function MyHistory() {
  const { effectiveRpcUrl, active } = useSettings();
  const logs = useLogs(effectiveRpcUrl);
  const mine = logs.logs
    .filter((l) => l.contract === 'market' && (l.eventName === 'Deposited' || l.eventName === 'Withdrawn'))
    .filter((l) => active && String(l.args.lender).toLowerCase() === active.address.toLowerCase())
    .reverse()
    .slice(0, 20);
  const times = useBlockTimes(effectiveRpcUrl, mine.map((l) => l.blockNumber));
  if (logs.scannedTo === null && logs.scanning) return <p className="muted small">Scanning events…</p>;
  if (mine.length === 0) return <Empty title="No deposits or withdrawals from this wallet yet" />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col" className="num-col">USDT</th>
            <th scope="col" className="num-col">Pool shares</th>
            <th scope="col">When</th>
          </tr>
        </thead>
        <tbody>
          {mine.map((l) => {
            const t = times.get(l.blockNumber);
            return (
              <tr key={l.id}>
                <th scope="row">{l.eventName === 'Deposited' ? 'Deposit' : 'Withdrawal'}</th>
                <td className="num-col">
                  <Amount value={l.args.assets as bigint} tip={`${l.eventName}.assets in block ${l.blockNumber}`} />
                </td>
                <td className="num-col">
                  <Amount kind="pool" value={l.args.shares as bigint} tip={`${l.eventName}.shares`} />
                </td>
                <td>
                  <Num tip={`Block ${formatInt(l.blockNumber)}`}>{t ? formatTime(t) : `#${formatInt(l.blockNumber)}`}</Num>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Lender() {
  const { snap } = useData();
  const f = useFmt();
  const { gate } = useGate();
  const loans = snap ? snap.loans : [];

  return (
    <>
      <PageHead title="Lender" lead="Deposit USDT into the pool. Loans are only made against bids already locked to buy the collateral on default." />
      <PartyHint expected={['Lender']} action="Deposits and withdrawals use the active wallet." />
      {gate ??
        (snap && (
          <>
            <KpiRow>
              <Kpi label="My pool shares">
                <Amount
                  kind="pool"
                  value={snap.party?.poolShares ?? 0n}
                  tip="StandbyMarket.sharesOf(active wallet). Pool shares use USDT base units: the first deposit mints 1 share per base unit."
                />
              </Kpi>
              <Kpi label="Their value" tone="accent">
                <Amount
                  value={snap.party?.poolValue ?? 0n}
                  tip={`convertToAssets(shares) = shares × (totalAssets + 1) / (totalShares + 1)\n= ${formatInt(snap.party?.poolShares ?? 0n)} × ${formatInt(snap.totalAssets + 1n)} / ${formatInt(snap.totalShares + 1n)} base units`}
                />
              </Kpi>
              <Kpi label="Share price">
                <Num tip={`(totalAssets + 1) / (totalShares + 1) = ${formatInt(snap.totalAssets + 1n)} / ${formatInt(snap.totalShares + 1n)}\nUSDT per pool share; rises as interest accrues`}>
                  {sharePrice(snap)} <span className="unit">{f.sym}</span>
                </Num>
              </Kpi>
              <Kpi label="Wallet USDT">
                <Amount value={snap.party?.usdt ?? 0n} tip="USDT.balanceOf(active wallet)" />
              </Kpi>
            </KpiRow>
            <KpiRow>
              <Kpi label="Pool total assets">
                <Amount value={snap.totalAssets} tip={`totalAssets() = cash + principal + accrued interest = ${f.u(snap.cash)} + ${f.u(snap.totalPrincipal)} + ${f.u(interestAccrued(snap))}`} />
              </Kpi>
              <Kpi label="Pool cash">
                <Amount value={snap.cash} tip="StandbyMarket.cash(): idle USDT available to lend or withdraw" />
              </Kpi>
              <Kpi label="Outstanding principal">
                <Amount value={snap.totalPrincipal} tip={`StandbyMarket.totalPrincipal() over ${openLoans(snap).length} open loan(s)`} />
              </Kpi>
              <Kpi label="Interest earned" tone="positive">
                <Amount value={interestAccrued(snap)} tip={`totalAssets − cash − totalPrincipal = ${f.u(snap.totalAssets)} − ${f.u(snap.cash)} − ${f.u(snap.totalPrincipal)}`} />
              </Kpi>
            </KpiRow>
            <div className="split">
              <div className="split-main">
                <Explainer
                  doing={[
                    'Deposit USDT for pool shares; their value grows with interest from loans.',
                    'Withdraw any time from idle cash. Every loan is backed by reserved buyer USDT, so a default is paid in USDT in one transaction.',
                    'Settle a defaulted loan yourself if the keeper has not: anyone can call it after maturity plus grace.',
                  ]}
                  risks={[
                    'Withdrawals are limited to idle cash; lent USDT comes back on repayment or settlement.',
                    'If collateral or reserved bids fall short at settlement, the shortfall is a loss to the pool.',
                    'Loans need a fresh NAV; a wrong NAV posted by the issuer mis-sizes new loans.',
                  ]}
                />
                <Card title="Pool loans">
                  <LoansTable loans={loans} mode="pool" />
                </Card>
                <Card title="My deposits and withdrawals">
                  <MyHistory />
                </Card>
              </div>
              <aside className="split-side">
                <DepositCard />
                <WithdrawCard />
              </aside>
            </div>
          </>
        ))}
    </>
  );
}
