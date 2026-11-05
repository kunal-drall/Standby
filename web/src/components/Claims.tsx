// v1.2 claims: shares the market holds for an account that was off the allowlist when they were
// owed, and commitment fees whose transfer failed. Shown only when something is claimable.
import { standbyMarketAbi } from '@standby/shared';
import { parseEventLogs } from 'viem';
import { CONTRACTS } from '../config';
import { useData } from '../state/data';
import { TxButton, TxPanel, useTx } from './Tx';
import { Amount, Card, useFmt } from './ui';

export function ClaimCard() {
  const { snap } = useData();
  const f = useFmt();
  const shares = useTx();
  const fees = useTx();
  if (!snap?.party || !CONTRACTS) return null;
  const c = CONTRACTS;
  const { claimableShares, claimableFees, roles } = snap.party;
  if (claimableShares === 0n && claimableFees === 0n) return null;

  return (
    <Card title="Held for you by the market">
      <p className="muted small">
        The market keeps shares owed to a wallet that is off the allowlist at that moment, and fees whose transfer failed, so one
        account can never block a repayment or a settlement.
      </p>
      {claimableShares > 0n && (
        <div className="claim-row">
          <div>
            <div className="kpi-label">Shares</div>
            <Amount kind="shares" value={claimableShares} tip="StandbyMarket.claimableShares(active wallet)" />
            {roles === 0 && <p className="hint text-warning">This wallet is not on the allowlist; the claim is rejected until the issuer adds it.</p>}
          </div>
          <TxButton
            pending={shares.pending}
            disabled={shares.busy}
            onClick={() =>
              void shares.run('Claim shares', async (send) => {
                const receipt = await send.write({ label: 'Claim shares', address: c.market, abi: standbyMarketAbi, functionName: 'claimShares' });
                const ev = parseEventLogs({ abi: standbyMarketAbi, logs: receipt.logs, eventName: 'SharesClaimed' })[0];
                return ev ? `Claimed ${f.s(ev.args.shares)} shares.` : 'Shares claimed.';
              })
            }
          >
            Claim shares
          </TxButton>
        </div>
      )}
      <TxPanel state={shares.state} />
      {claimableFees > 0n && (
        <div className="claim-row">
          <div>
            <div className="kpi-label">Commitment fees</div>
            <Amount value={claimableFees} tip="StandbyMarket.claimableFees(active wallet)" />
          </div>
          <TxButton
            pending={fees.pending}
            disabled={fees.busy}
            onClick={() =>
              void fees.run('Claim fees', async (send) => {
                const receipt = await send.write({ label: 'Claim fees', address: c.market, abi: standbyMarketAbi, functionName: 'claimFees' });
                const ev = parseEventLogs({ abi: standbyMarketAbi, logs: receipt.logs, eventName: 'FeesClaimed' })[0];
                return ev ? `Claimed ${f.usdt(ev.args.amount)} of fees.` : 'Fees claimed.';
              })
            }
          >
            Claim fees
          </TxButton>
        </div>
      )}
      <TxPanel state={fees.state} />
    </Card>
  );
}
