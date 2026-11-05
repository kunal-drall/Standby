import { standbyMarketAbi, txUrl } from '@standby/shared';
import { BaseError, ContractFunctionRevertedError, type Address, type PublicClient } from 'viem';
import type { KeeperWallet } from './chain.js';

export type SettleLog = (entry: Record<string, unknown>) => void;

export type Settler = {
  /** One pass: settle every settleable loan. Returns the loan ids settled in this pass. */
  tick(): Promise<bigint[]>;
  /** Loans given up on after the maximum number of failed attempts. */
  abandoned(): bigint[];
};

function reason(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? revert.shortMessage;
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Polls open loans and calls `settle` on any that `isSettleable`. It holds no authority the
 * contracts do not give everyone: anyone may call `settle`. A loan whose settlement fails
 * `maxAttempts` times is left alone (and logged) so one bad loan cannot stall the loop.
 */
export function createSettler(opts: {
  client: PublicClient;
  wallet: KeeperWallet;
  market: Address;
  maxAttempts: number;
  log?: SettleLog;
}): Settler {
  const { client, wallet, market, maxAttempts } = opts;
  const log = opts.log ?? ((e) => console.log(JSON.stringify(e)));
  const closed = new Set<bigint>();
  const failures = new Map<bigint, number>();
  const gaveUp = new Set<bigint>();

  return {
    abandoned: () => [...gaveUp],
    async tick() {
      const count = await client.readContract({ address: market, abi: standbyMarketAbi, functionName: 'loanCount' });
      const settled: bigint[] = [];
      for (let id = 0n; id < count; id++) {
        if (closed.has(id) || gaveUp.has(id)) continue;
        const [loan] = await client.readContract({
          address: market,
          abi: standbyMarketAbi,
          functionName: 'getLoan',
          args: [id],
        });
        if (loan.state !== 1) {
          closed.add(id); // Repaid or Settled: never needs work again
          continue;
        }
        const settleable = await client.readContract({
          address: market,
          abi: standbyMarketAbi,
          functionName: 'isSettleable',
          args: [id],
        });
        if (!settleable) continue;

        try {
          const { request } = await client.simulateContract({
            address: market,
            abi: standbyMarketAbi,
            functionName: 'settle',
            args: [id],
            account: wallet.account,
          });
          const hash = await wallet.writeContract(request);
          const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
          if (receipt.status !== 'success') throw new Error(`settle reverted in ${hash}`);
          closed.add(id);
          settled.push(id);
          log({ event: 'settled', loanId: id.toString(), txHash: hash, explorer: txUrl(hash) });
        } catch (err) {
          const attempts = (failures.get(id) ?? 0) + 1;
          failures.set(id, attempts);
          const done = attempts >= maxAttempts;
          if (done) gaveUp.add(id);
          log({ event: done ? 'gave_up' : 'settle_failed', loanId: id.toString(), attempts, reason: reason(err) });
        }
      }
      return settled;
    },
  };
}

/** Runs `tick` every `intervalMs`, never overlapping two passes. Returns a stop function. */
export function startLoop(settler: Settler, intervalMs: number, log: SettleLog): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const run = async () => {
    try {
      await settler.tick();
    } catch (err) {
      log({ event: 'tick_failed', reason: reason(err) });
    }
    if (!stopped) timer = setTimeout(run, intervalMs);
  };
  void run();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
