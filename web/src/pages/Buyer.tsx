import { bidBookAbi, formatDuration, percentToBps } from '@standby/shared';
import { useState } from 'react';
import { parseEventLogs, parseUnits } from 'viem';
import { TxButton, TxPanel, useTx } from '../components/Tx';
import {
  Amount,
  Badge,
  Card,
  Empty,
  Explainer,
  Kpi,
  KpiRow,
  MiniBar,
  Num,
  PageHead,
  PartyHint,
  useFmt,
  useGate,
} from '../components/ui';
import { CONTRACTS } from '../config';
import { backsUntil, priceOf } from '../lib/derived';
import { formatTime, pct, relative } from '../lib/format';
import type { BidView, Snapshot } from '../lib/snapshot';
import { useData, useNow } from '../state/data';
import { useSettings } from '../state/settings';

export function ExitStatus({ bid, now, snap }: { bid: BidView; now: number; snap: Snapshot }) {
  if (bid.closed) return <Badge tone="neutral">Closed</Badge>;
  if (bid.exitAt === 0) {
    return (
      <Num tip={`No exit requested. After requesting, the USDT unlocks after the notice period (${formatDuration(bid.notice)}).`} className="num-plain">
        <Badge tone="positive">Standing</Badge>
      </Num>
    );
  }
  const unlocked = now >= bid.exitAt;
  return (
    <Num
      className="num-plain"
      tip={`exitAt = request time + notice (${formatDuration(bid.notice)}) = ${formatTime(bid.exitAt)}\n${
        backsUntil(bid, snap.freeUntil)
          ? 'Still backs a loan opened now (unlocks after now + loanTerm + grace).'
          : 'No longer backs new loans: it unlocks before a loan opened now would end.'
      }\nReserved USDT stays locked until the loan using it is repaid or settled.`}
    >
      {unlocked ? <Badge tone="info">Unlocked {relative(bid.exitAt, now)}</Badge> : <Badge tone="warning">Unlocks {relative(bid.exitAt, now)}</Badge>}
    </Num>
  );
}

function PostBidCard() {
  const { snap } = useData();
  const f = useFmt();
  const tx = useTx();
  const [amountText, setAmountText] = useState('500');
  const [discountText, setDiscountText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  if (!snap || !CONTRACTS) return null;
  const c = CONTRACTS;

  const maxPct = snap.maxDiscountBps / 100;
  const discountValue = discountText ?? String(Math.min(3, maxPct));
  const noticeValue = noticeText ?? String(snap.minNotice);

  let amount: bigint | null = null;
  try {
    amount = parseUnits(amountText.trim(), snap.decimals);
  } catch {
    amount = null;
  }
  let bps: number | null = null;
  try {
    bps = percentToBps(discountValue);
  } catch {
    bps = null;
  }
  const notice = /^\d+$/.test(noticeValue.trim()) ? Number(noticeValue.trim()) : null;
  const price = bps !== null ? priceOf(snap, bps) : null;
  const tooHigh = bps !== null && bps > snap.maxDiscountBps;
  const tooShort = notice !== null && notice < snap.minNotice;
  const balance = snap.party?.usdt ?? 0n;

  return (
    <Card title="Post a standing bid">
      <div className="field">
        <label htmlFor="bid-amount">Bid amount</label>
        <div className="input-group input-lg">
          <input id="bid-amount" className="input" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} aria-invalid={amount === null || undefined} />
          <span className="input-suffix">{f.sym}</span>
        </div>
        <span className="hint">
          Wallet: <Amount value={balance} tip="USDT.balanceOf(active wallet)" />
        </span>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="bid-discount">Discount (%)</label>
          <input
            id="bid-discount"
            className="input"
            inputMode="decimal"
            value={discountValue}
            onChange={(e) => setDiscountText(e.target.value)}
            aria-invalid={bps === null || tooHigh || undefined}
          />
          <span className={tooHigh ? 'hint text-warning' : 'hint'}>
            max <Num tip="BidBook.maxDiscountBps()">{pct(snap.maxDiscountBps)}</Num>
          </span>
        </div>
        <div className="field">
          <label htmlFor="bid-notice">Notice (seconds)</label>
          <input
            id="bid-notice"
            className="input"
            inputMode="numeric"
            value={noticeValue}
            onChange={(e) => setNoticeText(e.target.value)}
            aria-invalid={notice === null || tooShort || undefined}
          />
          <span className={tooShort ? 'hint text-warning' : 'hint'}>
            min <Num tip={`BidBook.minNotice() = ${snap.minNotice} s`}>{formatDuration(snap.minNotice)}</Num>
          </span>
        </div>
      </div>
      <dl className="summary">
        <div>
          <dt>Your price</dt>
          <dd>
            {price !== null ? (
              <Num tip={`price = NAV × (1 − discount) = ${f.nav(snap.nav)} × (1 − ${pct(bps ?? 0)}) per share`}>
                {f.nav(price)} {f.sym} / share
              </Num>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Buys up to</dt>
          <dd>
            {price !== null && price > 0n && amount !== null ? (
              <Amount kind="shares" value={(amount * 10n ** 18n) / price} tip={`amount / price = ${f.u(amount)} / ${f.nav(price)}, if every unit is used in a settlement`} />
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Steps</dt>
          <dd className="muted">approve USDT to the bid book, then post</dd>
        </div>
      </dl>
      <TxButton
        size="block"
        pending={tx.pending}
        disabled={tx.busy || amount === null || bps === null || notice === null}
        onClick={() => {
          if (amount === null || bps === null || notice === null) return;
          const a = amount;
          const d = bps;
          const n = notice;
          void tx.run('Post bid', async (send) => {
            await send.ensureAllowance({ token: c.usdt, spender: c.bidBook, amount: a, label: 'Approve USDT for the bid book' });
            const receipt = await send.write({ label: 'Post bid', address: c.bidBook, abi: bidBookAbi, functionName: 'postBid', args: [a, d, n] });
            const ev = parseEventLogs({ abi: bidBookAbi, logs: receipt.logs, eventName: 'BidPosted' })[0];
            return ev
              ? `Bid #${ev.args.bidId} posted: ${f.usdt(ev.args.amount)} at ${pct(ev.args.discountBps)} discount, ${formatDuration(ev.args.notice)} notice.`
              : 'Bid posted.';
          });
        }}
      >
        Post bid
      </TxButton>
      <TxPanel state={tx.state} />
    </Card>
  );
}

function MyBids({ bids }: { bids: BidView[] }) {
  const { snap } = useData();
  const now = useNow();
  const f = useFmt();
  const tx = useTx();
  const [target, setTarget] = useState<bigint | null>(null);
  if (!snap || !CONTRACTS) return null;
  const c = CONTRACTS;
  if (bids.length === 0) return <Empty title="No bids from this wallet yet">Post one to start backing loans.</Empty>;

  const requestExit = (bid: BidView) => {
    setTarget(bid.id);
    void tx.run(`Request exit for bid #${bid.id}`, async (send) => {
      const receipt = await send.write({ label: 'Request exit', address: c.bidBook, abi: bidBookAbi, functionName: 'requestExit', args: [bid.id] });
      const ev = parseEventLogs({ abi: bidBookAbi, logs: receipt.logs, eventName: 'ExitRequested' })[0];
      return ev ? `Bid #${bid.id} unlocks at ${formatTime(ev.args.exitAt)}.` : `Exit requested for bid #${bid.id}.`;
    });
  };
  const withdraw = (bid: BidView) => {
    setTarget(bid.id);
    const free = bid.amount - bid.reserved;
    void tx.run(`Withdraw from bid #${bid.id}`, async (send) => {
      const receipt = await send.write({ label: 'Withdraw', address: c.bidBook, abi: bidBookAbi, functionName: 'withdraw', args: [bid.id, free] });
      const ev = parseEventLogs({ abi: bidBookAbi, logs: receipt.logs, eventName: 'BidWithdrawn' })[0];
      return `Withdrew ${f.usdt(ev?.args.amount ?? free)} from bid #${bid.id}.`;
    });
  };

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Bid</th>
              <th scope="col" className="num-col">Amount</th>
              <th scope="col">Reserved vs free</th>
              <th scope="col" className="num-col">Discount</th>
              <th scope="col" className="num-col">Price</th>
              <th scope="col">Exit</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {bids.map((bid) => {
              const free = bid.amount - bid.reserved;
              const price = priceOf(snap, bid.discountBps);
              return (
                <tr key={bid.id.toString()}>
                  <th scope="row">Bid #{bid.id.toString()}</th>
                  <td className="num-col">
                    <Amount value={bid.amount} tip="Bid.amount: USDT held for this bid, reserved part included" />
                  </td>
                  <td className="bar-col">
                    <MiniBar reserved={bid.reserved} total={bid.amount} label={`Reserved ${f.u(bid.reserved)} of ${f.u(bid.amount)}`} />
                    <span className="bar-legend">
                      <Amount value={bid.reserved} tip="Bid.reserved: backing open loans, never withdrawable" className="text-accent" /> ·{' '}
                      <Amount value={free} tip={`free = amount − reserved = ${f.u(bid.amount)} − ${f.u(bid.reserved)}`} className="text-positive" />
                    </span>
                  </td>
                  <td className="num-col">
                    <Num tip="Bid.discountBps: discount to NAV this bid buys at">{pct(bid.discountBps)}</Num>
                  </td>
                  <td className="num-col">
                    <Num tip={`price = NAV × (1 − discount) = ${f.nav(snap.nav)} × (1 − ${pct(bid.discountBps)})`}>
                      {f.nav(price)}
                    </Num>
                  </td>
                  <td>
                    <ExitStatus bid={bid} now={now} snap={snap} />
                  </td>
                  <td className="actions-col">
                    {!bid.closed && bid.exitAt === 0 && (
                      <TxButton size="sm" variant="secondary" pending={tx.pending && target === bid.id} disabled={tx.busy} onClick={() => requestExit(bid)}>
                        Request exit
                      </TxButton>
                    )}
                    {!bid.closed && bid.exitAt !== 0 && (
                      <TxButton size="sm" pending={tx.pending && target === bid.id} disabled={tx.busy} onClick={() => withdraw(bid)}>
                        Withdraw
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

export function Buyer() {
  const { snap } = useData();
  const { active, party } = useSettings();
  const { gate } = useGate();
  const f = useFmt();

  const mine = snap && active ? snap.bids.filter((b) => b.buyer.toLowerCase() === active.address.toLowerCase()) : [];
  const sorted = [...mine].sort((a, b) => (a.closed === b.closed ? Number(b.id - a.id) : a.closed ? 1 : -1));
  const open = mine.filter((b) => !b.closed);
  const committed = open.reduce((s, b) => s + b.amount, 0n);
  const reserved = open.reduce((s, b) => s + b.reserved, 0n);

  return (
    <>
      <PageHead
        title="Buyer"
        lead="Lock USDT in a standing bid to buy fund shares at a discount if a borrower defaults. Loans can only be made against bids like yours."
      />
      <PartyHint expected={['Buyer 1', 'Buyer 2']} action="Bids are posted from the active wallet, which needs the BUYER role." />
      {gate ??
        (snap && (
          <>
            <KpiRow>
              <Kpi label={`${party} committed`}>
                <Amount value={committed} tip={`Σ amount over your open bids = ${open.map((b) => f.u(b.amount)).join(' + ') || '0'}`} />
              </Kpi>
              <Kpi label="Reserved by loans" tone="accent">
                <Amount value={reserved} tip={`Σ reserved over your open bids = ${open.map((b) => f.u(b.reserved)).join(' + ') || '0'}`} />
              </Kpi>
              <Kpi label="Free" tone="positive">
                <Amount value={committed - reserved} tip="committed − reserved: withdrawable after an exit's notice period ends" />
              </Kpi>
              <Kpi label="Wallet USDT">
                <Amount value={snap.party?.usdt ?? 0n} tip="USDT.balanceOf(active wallet)" />
              </Kpi>
              <Kpi label="NAV">
                <Num tip={`NavOracle.latest().nav = ${snap.nav.toString()} base units per 1e18 shares`}>
                  {f.nav(snap.nav)} <span className="unit">{f.sym}</span>
                </Num>
              </Kpi>
            </KpiRow>
            <div className="split">
              <div className="split-main">
                <Explainer
                  doing={[
                    'Lock USDT at a discount to NAV with a notice period. Free USDT in your bid backs new loans.',
                    'When a loan opens, part of your bid is reserved for it until it is repaid or settled; you earn a commitment fee on repayment.',
                    'Request an exit to stop backing new loans that would outlast your notice; withdraw free USDT once the notice ends.',
                  ]}
                  risks={[
                    'On default your reserved USDT buys shares at your price, whatever the market does.',
                    'Withdrawing before the notice period ends is rejected, and reserved USDT is never withdrawable.',
                    'If the issuer removes your BUYER role, your bids stop counting as capacity.',
                  ]}
                />
                <Card title="My bids" aside={<span className="muted small">newest first</span>}>
                  <MyBids bids={sorted} />
                </Card>
              </div>
              <aside className="split-side">
                <PostBidCard />
              </aside>
            </div>
          </>
        ))}
    </>
  );
}
