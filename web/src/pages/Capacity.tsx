import { bidBookAbi, formatDuration, Role } from '@standby/shared';
import { useState } from 'react';
import { parseEventLogs } from 'viem';
import { TxButton, TxPanel, useTx } from '../components/Tx';
import { CONTRACTS } from '../config';
import { ExitStatus } from './Buyer';
import {
  AddressCell,
  Amount,
  Badge,
  Card,
  Empty,
  Explainer,
  Kpi,
  KpiRow,
  Num,
  PageHead,
  StackBar,
  useFmt,
  useGate,
} from '../components/ui';
import { backsUntil, bidTotals, openLoans, priceOf, sumTerms } from '../lib/derived';
import { formatTime, pct, relative } from '../lib/format';
import type { BidView, Snapshot } from '../lib/snapshot';
import { useData, useNow } from '../state/data';

function isBuyer(snap: Snapshot, bid: BidView): boolean {
  return ((snap.buyerRoles[bid.buyer.toLowerCase()] ?? 0) & Role.BUYER) !== 0;
}

function BacksBadge({ snap, bid }: { snap: Snapshot; bid: BidView }) {
  const buyer = isBuyer(snap, bid);
  const time = backsUntil(bid, snap.freeUntil);
  const free = bid.amount - bid.reserved;
  const tip = !buyer
    ? 'The buyer no longer holds the BUYER role: this bid backs no new loan, and anyone can evict its free USDT back to the buyer.'
    : !time
      ? `In exit: unlocks ${formatTime(bid.exitAt)}, before a loan opened now would end (${formatTime(snap.freeUntil)}).`
      : free === 0n
        ? 'Fully reserved by open loans.'
        : `Counts toward freeCapacity(${formatTime(snap.freeUntil)}).`;
  return (
    <Num tip={tip} className="num-plain">
      {!buyer ? (
        <Badge tone="negative">buyer removed</Badge>
      ) : !time ? (
        <Badge tone="warning">exits too soon</Badge>
      ) : free === 0n ? (
        <Badge tone="accent">fully reserved</Badge>
      ) : (
        <Badge tone="positive">yes</Badge>
      )}
    </Num>
  );
}

export function Capacity() {
  const { snap } = useData();
  const now = useNow();
  const f = useFmt();
  const { gate } = useGate();
  const tx = useTx();
  const [target, setTarget] = useState<bigint | null>(null);
  const evict = (bid: BidView) => {
    if (!CONTRACTS) return;
    const bidBook = CONTRACTS.bidBook;
    setTarget(bid.id);
    void tx.run(`Evict bid #${bid.id}`, async (send) => {
      const receipt = await send.write({ label: 'Evict', address: bidBook, abi: bidBookAbi, functionName: 'evict', args: [bid.id] });
      const ev = parseEventLogs({ abi: bidBookAbi, logs: receipt.logs, eventName: 'Evicted' })[0];
      return `Bid #${bid.id}: ${f.usdt(ev?.args.refunded ?? bid.amount - bid.reserved)} refunded to its buyer; the slot is free.`;
    });
  };

  return (
    <>
      <PageHead
        title="Capacity"
        lead="How much buyer USDT stands behind loans: committed in open bids, reserved by open loans, and free for a loan opened now."
      />
      {gate ??
        (snap &&
          (() => {
            const t = bidTotals(snap);
            const unlocking = t.open.filter((b) => b.exitAt !== 0).sort((a, b) => a.exitAt - b.exitAt);
            const best = t.open[0];
            return (
              <>
                <KpiRow>
                  <Kpi label="Committed">
                    <Amount value={t.committed} tip={`Σ amount of open bids = ${sumTerms(t.open.map((b) => f.u(b.amount)))}`} />
                  </Kpi>
                  <Kpi label="Reserved" tone="accent">
                    <Amount value={t.reserved} tip={`Σ reserved of open bids = ${sumTerms(t.open.map((b) => f.u(b.reserved)))}\nbacking ${openLoans(snap).length} open loan(s)`} />
                  </Kpi>
                  <Kpi label="Free for a loan now" tone="info">
                    <Amount
                      value={t.free}
                      tip={`BidBook.freeCapacity(now + loanTerm + grace)\n= freeCapacity(${formatTime(snap.freeUntil)}) at block ${snap.blockNumber}\nnow + ${formatDuration(snap.params.loanTerm)} + ${formatDuration(snap.params.grace)}`}
                    />
                  </Kpi>
                  <Kpi label="Unavailable">
                    <Amount value={t.unavailable} tip={`committed − reserved − free = ${f.u(t.committed)} − ${f.u(t.reserved)} − ${f.u(t.free)}\nIn exit before a new loan would end, or the buyer lost the BUYER role`} />
                  </Kpi>
                  <Kpi label="Cheapest bid">
                    {best ? (
                      <Num tip={`Bid #${best.id}: discount ${pct(best.discountBps)}; price = NAV × (1 − discount) = ${f.nav(snap.nav)} × (1 − ${pct(best.discountBps)})`}>
                        {f.nav(priceOf(snap, best.discountBps))} <span className="unit">{f.sym}</span>
                      </Num>
                    ) : (
                      <Num tip="No open bids">—</Num>
                    )}
                  </Kpi>
                </KpiRow>

                <Card title="Reserved vs free">
                  {t.committed === 0n ? (
                    <Empty title="No open bids yet">Buyers post bids on the Buyer page.</Empty>
                  ) : (
                    <StackBar
                      label={`Committed ${f.u(t.committed)} ${f.sym}: reserved ${f.u(t.reserved)}, free ${f.u(t.free)}, unavailable ${f.u(t.unavailable)}`}
                      segments={[
                        { key: 'res', label: 'Reserved', value: t.reserved, tone: 'accent', tip: 'Σ reserved of open bids' },
                        { key: 'free', label: 'Free now', value: t.free, tone: 'info', tip: 'freeCapacity(now + loanTerm + grace)' },
                        { key: 'na', label: 'Unavailable', value: t.unavailable, tone: 'muted', tip: 'committed − reserved − free' },
                      ]}
                    />
                  )}
                </Card>

                <Explainer
                  doing={[
                    'A new loan reserves bid USDT from the cheapest discount first, sized to cover what it will owe at maturity plus grace, grossed up by the haircut.',
                    'A bid in exit only backs loans that end before it unlocks, so it drops out of "free" once its unlock time is closer than a new loan’s end.',
                    'Capacity is read straight from the bid book; nothing here is estimated.',
                  ]}
                  risks={[
                    'When free capacity is low, the capacity limit, not the price limit, caps how much a borrower can take.',
                    'Exits lower capacity over time; reserved USDT stays locked until its loan is repaid or settled.',
                    'A buyer removed from the allowlist stops backing new loans at once; anyone can evict its free USDT back to it, while its reserved USDT still fills at settlement.',
                  ]}
                />

                <Card title="Open bids, cheapest first" aside={<span className="muted small">BidBook.openBidIds()</span>}>
                  {t.open.length === 0 ? (
                    <Empty title="No open bids" />
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th scope="col">Bid</th>
                            <th scope="col">Buyer</th>
                            <th scope="col" className="num-col">Discount</th>
                            <th scope="col" className="num-col">Price</th>
                            <th scope="col" className="num-col">Amount</th>
                            <th scope="col" className="num-col">Reserved</th>
                            <th scope="col" className="num-col">Free</th>
                            <th scope="col">Notice</th>
                            <th scope="col">Backs a new loan</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.open.map((b, i) => (
                            <tr key={b.id.toString()}>
                              <th scope="row">
                                <Num tip={`Position ${i + 1} in openBidIds: reserved ${i === 0 ? 'first' : `after ${i} cheaper or older bid(s)`}`} className="num-plain">
                                  Bid #{b.id.toString()}
                                </Num>
                              </th>
                              <td>
                                <AddressCell address={b.buyer} />
                              </td>
                              <td className="num-col">
                                <Num tip="Bid.discountBps">{pct(b.discountBps)}</Num>
                              </td>
                              <td className="num-col">
                                <Num tip={`NAV × (1 − discount) = ${f.nav(snap.nav)} × (1 − ${pct(b.discountBps)})`}>{f.nav(priceOf(snap, b.discountBps))}</Num>
                              </td>
                              <td className="num-col">
                                <Amount value={b.amount} tip="Bid.amount" />
                              </td>
                              <td className="num-col">
                                <Amount value={b.reserved} tip="Bid.reserved" />
                              </td>
                              <td className="num-col">
                                <Amount value={b.amount - b.reserved} tip={`amount − reserved = ${f.u(b.amount)} − ${f.u(b.reserved)}`} />
                              </td>
                              <td>
                                {b.exitAt === 0 ? (
                                  <Num tip="Bid.notice: seconds from an exit request to unlock">{formatDuration(b.notice)}</Num>
                                ) : (
                                  <ExitStatus bid={b} now={now} snap={snap} />
                                )}
                              </td>
                              <td>
                                <BacksBadge snap={snap} bid={b} />
                                {!isBuyer(snap, b) && b.amount > b.reserved && (
                                  <>
                                    {' '}
                                    <TxButton size="sm" variant="secondary" pending={tx.pending && target === b.id} disabled={tx.busy} onClick={() => evict(b)}>
                                      Evict
                                    </TxButton>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <TxPanel state={tx.state} />
                </Card>

                <Card title="Unlocking bids">
                  {unlocking.length === 0 ? (
                    <Empty title="No bids in exit">A bid appears here after its buyer requests an exit.</Empty>
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th scope="col">Bid</th>
                            <th scope="col">Buyer</th>
                            <th scope="col" className="num-col">Unreserved</th>
                            <th scope="col" className="num-col">Reserved</th>
                            <th scope="col">Unlocks</th>
                            <th scope="col">At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unlocking.map((b) => (
                            <tr key={b.id.toString()}>
                              <th scope="row">Bid #{b.id.toString()}</th>
                              <td>
                                <AddressCell address={b.buyer} />
                              </td>
                              <td className="num-col">
                                <Amount value={b.amount - b.reserved} tip="amount − reserved: what the buyer can withdraw once unlocked" />
                              </td>
                              <td className="num-col">
                                <Amount value={b.reserved} tip="Stays locked until the loans using it are repaid or settled" />
                              </td>
                              <td>
                                <Num tip={`exitAt − now = ${b.exitAt - now} s`}>{relative(b.exitAt, now)}</Num>
                              </td>
                              <td>
                                <Num tip="Bid.exitAt (request time + notice)">{formatTime(b.exitAt)}</Num>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </>
            );
          })())}
    </>
  );
}
