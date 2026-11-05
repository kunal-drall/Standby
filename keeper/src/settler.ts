import { standbyMarketAbi, txUrl } from '@standby/shared';
import {
  BaseError,
  ContractFunctionRevertedError,
  TransactionReceiptNotFoundError,
  WaitForTransactionReceiptTimeoutError,
  type Address,
  type Hash,
  type PublicClient,
} from 'viem';
import type { KeeperWallet } from './chain.js';

export type SettleLog = (entry: Record<string, unknown>) => void;

export type SettlerStatus = {
  pending: { loanId: string; txHash: Hash }[];
  backingOff: { loanId: string; retryAt: string; reason: string }[];
};

export type Settler = {
  /** One pass: settle every settleable loan. Returns the loan ids whose settlement landed in this pass. */
  tick(): Promise<bigint[]>;
  status(): SettlerStatus;
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
 * contracts do not give everyone: anyone may call `settle`.
 * - A sent transaction is followed until it lands; a slow receipt never causes a second send.
 * - After `maxAttempts` failures in a row a loan backs off for `cooldownMs`, then gets
 *   `maxAttempts` more tries, so a pause or an RPC outage delays settlement but never ends it.
 */
export function createSettler(opts: {
  client: PublicClient;
  wallet: KeeperWallet;
  market: Address;
  maxAttempts: number;
  cooldownMs?: number;
  receiptTimeoutMs?: number;
  now?: () => number;
  log?: SettleLog;
}): Settler {
  const { client, wallet, market, maxAttempts } = opts;
  const cooldownMs = opts.cooldownMs ?? 5 * 60_000;
  const receiptTimeoutMs = opts.receiptTimeoutMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((e) => console.log(JSON.stringify(e)));

  const closed = new Set<bigint>();
  const pending = new Map<bigint, Hash>();
  const failures = new Map<bigint, { count: number; retryAt: number; reason: string }>();

  const fail = (id: bigint, err: unknown) => {
    const f = failures.get(id) ?? { count: 0, retryAt: 0, reason: '' };
    f.count += 1;
    f.reason = reason(err);
    if (f.count >= maxAttempts) {
      f.count = 0;
      f.retryAt = now() + cooldownMs;
      log({ event: 'backing_off', loanId: id.toString(), retryAt: new Date(f.retryAt).toISOString(), reason: f.reason });
    } else {
      log({ event: 'settle_failed', loanId: id.toString(), attempt: f.count, reason: f.reason });
    }
    failures.set(id, f);
  };

  const landed = (id: bigint, hash: Hash, settled: bigint[]) => {
    pending.delete(id);
    failures.delete(id);
    closed.add(id);
    settled.push(id);
    log({ event: 'settled', loanId: id.toString(), txHash: hash, explorer: txUrl(hash) });
  };

  /** Checks a transaction sent in an earlier pass. True if the loan needs no more work this pass. */
  const followPending = async (id: bigint, hash: Hash, settled: bigint[]): Promise<boolean> => {
    try {
      const receipt = await client.getTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        landed(id, hash, settled);
        return true;
      }
      pending.delete(id);
      fail(id, new Error(`settle reverted in ${hash}`));
      return true;
    } catch (err) {
      if (err instanceof TransactionReceiptNotFoundError) return true; // still in flight
      throw err;
    }
  };

  return {
    status: () => ({
      pending: [...pending].map(([id, txHash]) => ({ loanId: id.toString(), txHash })),
      backingOff: [...failures]
        .filter(([, f]) => f.retryAt > now())
        .map(([id, f]) => ({ loanId: id.toString(), retryAt: new Date(f.retryAt).toISOString(), reason: f.reason })),
    }),

    async tick() {
      const count = await client.readContract({ address: market, abi: standbyMarketAbi, functionName: 'loanCount' });
      const settled: bigint[] = [];
      for (let id = 0n; id < count; id++) {
        if (closed.has(id)) continue;
        const hash = pending.get(id);
        if (hash && (await followPending(id, hash, settled))) continue;
        if ((failures.get(id)?.retryAt ?? 0) > now()) continue;

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

        let sent: Hash | undefined;
        try {
          const { request } = await client.simulateContract({
            address: market,
            abi: standbyMarketAbi,
            functionName: 'settle',
            args: [id],
            account: wallet.account,
          });
          sent = await wallet.writeContract(request);
          pending.set(id, sent);
          const receipt = await client.waitForTransactionReceipt({ hash: sent, timeout: receiptTimeoutMs });
          if (receipt.status !== 'success') throw new Error(`settle reverted in ${sent}`);
          landed(id, sent, settled);
        } catch (err) {
          if (sent && err instanceof WaitForTransactionReceiptTimeoutError) {
            log({ event: 'settle_pending', loanId: id.toString(), txHash: sent });
            continue; // followed up next pass; never re-sent while pending
          }
          pending.delete(id);
          fail(id, err);
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
