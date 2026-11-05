import { formatDuration } from '@standby/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Amount, Badge, Kpi, KpiRow, Num, StackBar, useFmt, useGate } from '../components/ui';
import { KEEPER_API } from '../config';
import { bidTotals, interestAccrued, navFresh, openLoans, sumTerms } from '../lib/derived';
import { formatTime, pct } from '../lib/format';
import { useData, useNow } from '../state/data';

function KeeperHealth() {
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!KEEPER_API) return;
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`${KEEPER_API}/api/health`, { signal: AbortSignal.timeout(5_000) });
        const body = (await res.json()) as { ok?: boolean; block?: number | string; navAgeSeconds?: number };
        if (alive) setState({ ok: res.ok && body.ok === true, text: body.ok ? `block ${String(body.block ?? '?')}` : 'not healthy' });
      } catch {
        if (alive) setState({ ok: false, text: 'unreachable' });
      }
    };
    void check();
    const id = window.setInterval(check, 15_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  if (!KEEPER_API) return null;
  return (
    <p className="muted small">
      Keeper read API: <Badge tone={state?.ok ? 'positive' : state ? 'negative' : 'neutral'}>{state ? state.text : 'checking…'}</Badge>{' '}
      <span className="mono">{KEEPER_API}</span>
    </p>
  );
}

function LiveStats() {
  const { snap } = useData();
  const now = useNow();
  const f = useFmt();
  const { gate } = useGate();
  if (gate) return <>{gate}</>;
  if (!snap) return null;
  const t = bidTotals(snap);
  const interest = interestAccrued(snap);
  const loans = openLoans(snap);
  const fresh = navFresh(snap, now);
  const age = snap.navUpdatedAt ? now - snap.navUpdatedAt : null;

  return (
    <>
      <h3 className="section-label">Lending pool</h3>
      <KpiRow>
        <Kpi label="Pool total assets">
          <Amount
            value={snap.totalAssets}
            tip={`StandbyMarket.totalAssets() = cash + outstanding principal + accrued interest\n= ${f.u(snap.cash)} + ${f.u(snap.totalPrincipal)} + ${f.u(interest)}`}
          />
        </Kpi>
        <Kpi label="Pool cash">
          <Amount value={snap.cash} tip="StandbyMarket.cash(): idle USDT the pool can lend or pay out to withdrawing lenders" />
        </Kpi>
        <Kpi label="Outstanding principal">
          <Amount value={snap.totalPrincipal} tip="StandbyMarket.totalPrincipal(): principal of all open loans" />
        </Kpi>
        <Kpi label="Interest accrued" tone="positive">
          <Amount
            value={interest}
            tip={`totalAssets − cash − totalPrincipal\n= ${f.u(snap.totalAssets)} − ${f.u(snap.cash)} − ${f.u(snap.totalPrincipal)}\nSimple interest at ${pct(snap.params.rateBps)} a year on open loans`}
          />
        </Kpi>
        <Kpi label="Open loans">
          <Num tip={`Loans with state Open, of loanCount() = ${snap.loans.length} loans ever opened`}>{loans.length}</Num>
        </Kpi>
      </KpiRow>

      <h3 className="section-label">Standing bids</h3>
      <KpiRow>
        <Kpi label="Committed">
          <Amount
            value={t.committed}
            tip={`Σ amount over open bids (BidBook.openBidIds)\n= ${sumTerms(t.open.map((b) => f.u(b.amount)))}`}
          />
        </Kpi>
        <Kpi label="Reserved by loans" tone="accent">
          <Amount
            value={t.reserved}
            tip={`Σ reserved over open bids\n= ${sumTerms(t.open.map((b) => f.u(b.reserved)))}\nReserved USDT is never withdrawable.`}
          />
        </Kpi>
        <Kpi label="Free for a loan now" tone="info">
          <Amount
            value={t.free}
            tip={`BidBook.freeCapacity(now + loanTerm + grace)\n= freeCapacity(${formatTime(snap.freeUntil)})\nUnreserved USDT in bids still locked when a loan opened now would end (${formatDuration(snap.params.loanTerm)} + ${formatDuration(snap.params.grace)} grace).`}
          />
        </Kpi>
        <Kpi label="NAV" sub={<>per share</>}>
          <Num
            tip={`NavOracle.latest().nav = ${snap.nav.toString()} USDT base units per 1e18 share units (USDT has ${snap.decimals} decimals)\nPosted ${snap.navUpdatedAt ? formatTime(snap.navUpdatedAt) : 'never'}`}
          >
            {f.nav(snap.nav)} <span className="unit">{f.sym}</span>
          </Num>
        </Kpi>
        <Kpi label="NAV age" tone={fresh ? undefined : 'warning'} sub={fresh ? <Badge tone="positive">fresh</Badge> : <Badge tone="warning">stale: new loans blocked</Badge>}>
          <Num tip={`now − updatedAt = ${age ?? '—'} s\nNew loans need age ≤ maxNavAge = ${formatDuration(snap.params.maxNavAge)}`}>
            {age === null ? 'never posted' : formatDuration(age)}
          </Num>
        </Kpi>
      </KpiRow>

      {t.committed > 0n && (
        <StackBar
          label="Bid USDT: reserved, free for a new loan, and unavailable"
          segments={[
            { key: 'res', label: 'Reserved', value: t.reserved, tone: 'accent', tip: 'Σ reserved over open bids' },
            { key: 'free', label: 'Free now', value: t.free, tone: 'info', tip: 'freeCapacity(now + loanTerm + grace)' },
            {
              key: 'na',
              label: 'In exit or buyer removed',
              value: t.unavailable,
              tone: 'muted',
              tip: 'committed − reserved − free: unreserved USDT in bids that unlock before a new loan would end, or whose buyer lost the BUYER role',
            },
          ]}
        />
      )}
      <KeeperHealth />
    </>
  );
}

const STEPS = [
  {
    who: 'Issuer',
    to: '/issuer',
    title: 'Allowlist and NAV',
    text: 'The issuer decides which wallets may hold the fund share and posts its NAV, the value of one share in USDT.',
  },
  {
    who: 'Buyers',
    to: '/buyer',
    title: 'Bids locked first',
    text: 'Allowlisted buyers lock USDT to buy shares at a fixed discount to NAV. A bid can only leave after a notice period, so its USDT is known to be there.',
  },
  {
    who: 'Lenders and borrowers',
    to: '/borrower',
    title: 'Loans sized by both price and buyers',
    text: 'Lenders pool USDT. A borrower pledges shares and borrows the lower of the price limit (max LTV × NAV × shares) and the capacity limit (what free bids cover after a haircut). The loan reserves those bids until maturity plus grace.',
  },
  {
    who: 'Keeper',
    to: '/capacity',
    title: 'Repay, or settle in one transaction',
    text: 'Repaying returns the shares and frees the bids; buyers earn a commitment fee. If the loan is not repaid by maturity plus grace, anyone settles it: the reserved bids pay the pool and receive the shares at their own discount.',
  },
];

export function Overview() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Whitechain Sepolia · test USDT</p>
        <h1>Lend against a restricted fund share. The buyers are already in line.</h1>
        <p className="lead">
          A tokenized T-bill fund share can only sit in wallets the issuer has allowlisted, so a lender cannot sell it on an open
          market if a borrower defaults. Standby solves the exit first: allowlisted buyers lock USDT bids to buy the share on
          default, and a loan is only made against bids that stay locked for its whole life.
        </p>
        <div className="hero-actions">
          <Link className="btn btn-primary" to="/borrower">
            Borrow against shares
          </Link>
          <Link className="btn btn-secondary" to="/lender">
            Lend USDT
          </Link>
          <Link className="btn btn-secondary" to="/buyer">
            Post a standing bid
          </Link>
        </div>
      </section>

      <section className="card" aria-labelledby="live-h">
        <div className="card-head">
          <h2 id="live-h">Live market</h2>
          <Link to="/activity" className="small">
            Activity →
          </Link>
        </div>
        <LiveStats />
      </section>

      <section aria-labelledby="how-h" className="how">
        <h2 id="how-h">How it works</h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step-card">
              <span className="step-num" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <p className="eyebrow">{s.who}</p>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <Link to={s.to} className="small">
                  Open {s.to.slice(1)} page →
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card why" aria-labelledby="why-h">
        <h2 id="why-h">Why buyers come before the loan</h2>
        <div className="why-grid">
          <p>
            Restricted assets fail as collateral for one reason: on default there may be nobody allowed to buy them. Most lending
            designs hope a liquidator turns up later. Standby turns that hope into a number you can check before lending: how
            much USDT is committed, how much is already reserved by loans, and how much is free.
          </p>
          <ul className="checks">
            <li>Every share moves only between allowlisted wallets, including at settlement.</li>
            <li>Reserved bid USDT can never be withdrawn; a bid in exit only backs loans ending before it unlocks.</li>
            <li>Every payment is in the official test USDT, and settlement happens in a single transaction.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
