// Loans table shared by the borrower page (own loans, Repay) and the lender page (pool loans,
// Settle). "Due now" and fees tick each second using the contract's own formulas.
import { formatDuration, LoanState, loanStateName, standbyMarketAbi } from '@standby/shared';
import { useState } from 'react';
import { parseEventLogs } from 'viem';
import { CONTRACTS } from '../config';
import { feeFor, interestFor } from '../lib/derived';
import { formatTime, pct, relative } from '../lib/format';
import type { LoanView, Snapshot } from '../lib/snapshot';
import { publicClientFor } from '../lib/clients';
import { useData, useNow } from '../state/data';
import { useSettings } from '../state/settings';
import { TxButton, TxPanel, useTx } from './Tx';
import { AddressCell, Amount, Badge, Empty, Num, useFmt } from './ui';

export function liveDue(snap: Snapshot, loan: LoanView, now: number): { due: bigint; fees: bigint; elapsed: number } {
  if (loan.state !== LoanState.Open) return { due: 0n, fees: 0n, elapsed: 0 };
  const elapsed = Math.max(0, now - loan.openedAt);
  const due = loan.principal + interestFor(loan.principal, snap.params.rateBps, elapsed);
  const fees = loan.reserved.reduce((s, r) => s + feeFor(r, snap.params.commitFeeBps, elapsed), 0n);
  return { due, fees, elapsed };
}

function StateBadge({ loan, now, snap }: { loan: LoanView; now: number; snap: Snapshot }) {
  const name = loanStateName(loan.state);
  if (loan.state === LoanState.Open) {
    const late = now > loan.maturity + snap.params.grace;
    return (
      <span className="badges">
        <Badge tone="info">Open</Badge>
        {loan.settleable ? <Badge tone="negative">settleable</Badge> : late ? <Badge tone="warning">past grace</Badge> : null}
      </span>
    );
  }
  return <Badge tone={loan.state === LoanState.Repaid ? 'positive' : 'warning'}>{name}</Badge>;
}

export function LoansTable({ loans, mode }: { loans: LoanView[]; mode: 'borrower' | 'pool' }) {
  const { snap } = useData();
  const { effectiveRpcUrl } = useSettings();
  const now = useNow();
  const f = useFmt();
  const tx = useTx();
  const [target, setTarget] = useState<bigint | null>(null);
  if (!snap || !CONTRACTS) return null;
  const c = CONTRACTS;
  const rows = [...loans].sort((a, b) => Number(b.id - a.id));

  const repay = (loan: LoanView) => {
    setTarget(loan.id);
    void tx.run(`Repay loan #${loan.id}`, async (send) => {
      const pub = publicClientFor(effectiveRpcUrl);
      const [dueNow, fees] = await pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'quoteRepay', args: [loan.id] });
      const owed = dueNow + fees;
      // repay pulls dueAt(execution time), which grows every second: approve 0.5% or 10 more minutes
      // of interest and fees, whichever is larger.
      const tenMin = interestFor(loan.principal, snap.params.rateBps, 600) + loan.reserved.reduce((s, r) => s + feeFor(r, snap.params.commitFeeBps, 600), 0n);
      const buffer = owed / 200n > tenMin ? owed / 200n : tenMin;
      const call = { label: `Repay loan #${loan.id}`, address: c.market, abi: standbyMarketAbi, functionName: 'repay', args: [loan.id] } as const;
      await send.preflight(call);
      await send.ensureAllowance({ token: c.usdt, spender: c.market, amount: owed + buffer, label: 'Approve USDT for the market' });
      const receipt = await send.write(call);
      const ev = parseEventLogs({ abi: standbyMarketAbi, logs: receipt.logs, eventName: 'LoanRepaid' })[0];
      return ev
        ? `Loan #${loan.id} repaid: ${f.usdt(ev.args.paid)} to the pool and ${f.usdt(ev.args.commitmentFees)} commitment fees to buyers. Collateral returned.`
        : `Loan #${loan.id} repaid.`;
    });
  };

  const settle = (loan: LoanView) => {
    setTarget(loan.id);
    void tx.run(`Settle loan #${loan.id}`, async (send) => {
      const receipt = await send.write({ label: `Settle loan #${loan.id}`, address: c.market, abi: standbyMarketAbi, functionName: 'settle', args: [loan.id] });
      const ev = parseEventLogs({ abi: standbyMarketAbi, logs: receipt.logs, eventName: 'LoanSettled' })[0];
      return ev
        ? `Loan #${loan.id} settled: ${f.usdt(ev.args.recovered)} recovered, ${f.s(ev.args.collateralToBuyers)} shares to buyers, ${f.s(ev.args.collateralReturned)} back to the borrower.`
        : `Loan #${loan.id} settled.`;
    });
  };

  if (rows.length === 0) {
    return (
      <Empty title={mode === 'borrower' ? 'No loans yet' : 'No loans in the pool yet'}>
        {mode === 'borrower' ? 'Pledge shares above to open one.' : 'Loans appear here when a borrower opens one.'}
      </Empty>
    );
  }

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Loan</th>
              <th scope="col" className="num-col">Collateral</th>
              <th scope="col" className="num-col">Principal</th>
              <th scope="col" className="num-col">Due now · fees</th>
              <th scope="col">Maturity · grace ends</th>
              <th scope="col">State</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((loan) => {
              const open = loan.state === LoanState.Open;
              const live = liveDue(snap, loan, now);
              const graceEnd = loan.maturity + snap.params.grace;
              return (
                <tr key={loan.id.toString()}>
                  <th scope="row">
                    Loan #{loan.id.toString()}
                    {mode === 'pool' && (
                      <span className="cell-sub">
                        <AddressCell address={loan.borrower} />
                      </span>
                    )}
                  </th>
                  <td className="num-col">
                    <Amount kind="shares" value={loan.collateral} tip="Loan.collateral: shares pledged to the market" />
                  </td>
                  <td className="num-col">
                    <Amount value={loan.principal} tip="Loan.principal: USDT lent at opening" />
                  </td>
                  <td className="num-col">
                    {open ? (
                      <>
                        <Amount
                          value={live.due}
                          tip={`dueAt(now) = principal + principal × rate × elapsed / 365 days\n= ${f.u(loan.principal)} + ${f.u(loan.principal)} × ${pct(snap.params.rateBps)} × ${live.elapsed} s / 365 days\ndue(${loan.id}) at block ${snap.blockNumber} = ${f.u(loan.due)}`}
                        />
                        <span className="cell-sub">
                          +{' '}
                          <Amount
                            value={live.fees}
                            tip={`Commitment fees to buyers = Σ reserved × ${pct(snap.params.commitFeeBps)} × elapsed / 365 days\nreserved = ${loan.reserved.map((r) => f.u(r)).join(' + ') || '0'}\nquoteRepay(${loan.id}).fees at block ${snap.blockNumber} = ${f.u(loan.fees)}`}
                          />{' '}
                          fees
                        </span>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <Num tip={`Loan.maturity = openedAt + loanTerm = ${formatTime(loan.openedAt)} + ${formatDuration(snap.params.loanTerm)}`}>
                      {open ? relative(loan.maturity, now) : formatTime(loan.maturity)}
                    </Num>
                    <span className="cell-sub">
                      grace{' '}
                      <Num tip={`maturity + grace (${formatDuration(snap.params.grace)}) = ${formatTime(graceEnd)}. After this anyone can settle (with a fresh NAV).`}>
                        {open ? relative(graceEnd, now) : formatTime(graceEnd)}
                      </Num>
                    </span>
                  </td>
                  <td>
                    <Num
                      className="num-plain"
                      tip={`getLoan(${loan.id}).state = ${loanStateName(loan.state)}; isSettleable = ${loan.settleable} (open, fresh NAV, and now > maturity + grace or debt above ${pct(snap.params.liqThresholdBps)} of collateral value)`}
                    >
                      <StateBadge loan={loan} now={now} snap={snap} />
                    </Num>
                  </td>
                  <td className="actions-col">
                    {open && mode === 'borrower' && (
                      <TxButton size="sm" pending={tx.pending && target === loan.id} disabled={tx.busy} onClick={() => repay(loan)}>
                        Repay
                      </TxButton>
                    )}
                    {open && mode === 'pool' && loan.settleable && (
                      <TxButton size="sm" variant="secondary" pending={tx.pending && target === loan.id} disabled={tx.busy} onClick={() => settle(loan)}>
                        Settle
                      </TxButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TxPanel state={tx.state} />
    </>
  );
}
