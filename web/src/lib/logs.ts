// Event log scanning for the Activity page and the issuer's allowlist table. Scans from the start
// block to latest in chunks of at most LOG_CHUNK blocks, then incrementally on each poll. Kept in a
// module-level store per RPC URL so pages share one scan.
import {
  allowlistRegistryAbi,
  bidBookAbi,
  navOracleAbi,
  restrictedAssetAbi,
  standbyMarketAbi,
} from '@standby/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { decodeEventLog, type Abi, type Hash, type PublicClient } from 'viem';
import { CONTRACTS, LOG_CHUNK, START_BLOCK, type ContractKey } from '../config';
import { publicClientFor } from './clients';
import { readErrorText } from './errors';

export type EventContract = Exclude<ContractKey, 'usdt'>;

export type ActivityLog = {
  id: string;
  contract: EventContract;
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
  txHash: Hash;
};

type StoreState = {
  logs: ActivityLog[];
  scannedTo: bigint | null;
  latest: bigint | null;
  scanning: boolean;
  error: string | null;
};

const ABI_OF: Record<EventContract, Abi> = {
  registry: allowlistRegistryAbi as Abi,
  asset: restrictedAssetAbi as Abi,
  oracle: navOracleAbi as Abi,
  bidBook: bidBookAbi as Abi,
  market: standbyMarketAbi as Abi,
};

class LogStore {
  state: StoreState = { logs: [], scannedTo: null, latest: null, scanning: false, error: null };
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;

  constructor(private pub: PublicClient) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  private set(patch: Partial<StoreState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  scan(): Promise<void> {
    if (!this.running) {
      this.running = this.doScan().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async doScan() {
    const c = CONTRACTS;
    if (!c) return;
    const byAddress = new Map<string, EventContract>();
    for (const key of Object.keys(ABI_OF) as EventContract[]) byAddress.set(c[key].toLowerCase(), key);
    const addresses = [c.registry, c.asset, c.oracle, c.bidBook, c.market];
    this.set({ scanning: true });
    try {
      const latest = await this.pub.getBlockNumber();
      let from = this.state.scannedTo === null ? START_BLOCK : this.state.scannedTo + 1n;
      this.set({ latest });
      while (from <= latest) {
        const to = from + LOG_CHUNK - 1n < latest ? from + LOG_CHUNK - 1n : latest;
        const raw = await this.pub.getLogs({ address: addresses, fromBlock: from, toBlock: to });
        const decoded: ActivityLog[] = [];
        for (const log of raw) {
          const contract = byAddress.get(log.address.toLowerCase());
          if (!contract || log.blockNumber === null || log.transactionHash === null || log.logIndex === null) continue;
          try {
            const ev = decodeEventLog({ abi: ABI_OF[contract], data: log.data, topics: log.topics });
            decoded.push({
              id: `${log.transactionHash}:${log.logIndex}`,
              contract,
              eventName: ev.eventName ?? 'Unknown',
              args: (ev.args ?? {}) as Record<string, unknown>,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
              txHash: log.transactionHash,
            });
          } catch {
            // Not an event we know; skip.
          }
        }
        const seen = new Set(this.state.logs.map((l) => l.id));
        const fresh = decoded.filter((l) => !seen.has(l.id));
        this.set({ logs: fresh.length ? [...this.state.logs, ...fresh] : this.state.logs, scannedTo: to, error: null });
        from = to + 1n;
      }
      this.set({ scanning: false, error: null, scannedTo: this.state.scannedTo ?? latest });
    } catch (e) {
      this.set({ scanning: false, error: readErrorText(e) });
    }
  }
}

const stores = new Map<string, LogStore>();

function storeFor(rpcUrl: string): LogStore {
  let store = stores.get(rpcUrl);
  if (!store) {
    store = new LogStore(publicClientFor(rpcUrl));
    stores.set(rpcUrl, store);
  }
  return store;
}

/** Event logs from the five contracts, oldest first; rescans every `intervalMs`. */
export function useLogs(rpcUrl: string, intervalMs = 6_000): StoreState & { rescan: () => Promise<void> } {
  const store = storeFor(rpcUrl);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  useEffect(() => {
    if (!CONTRACTS) return;
    void store.scan();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void store.scan();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [store, intervalMs]);
  return { ...state, rescan: () => store.scan() };
}

const blockTimes = new Map<string, number>();

/** Timestamps for the given blocks, fetched once each and cached. */
export function useBlockTimes(rpcUrl: string, blocks: bigint[]): Map<bigint, number> {
  const [, setTick] = useState(0);
  const key = blocks.join(',');
  useEffect(() => {
    const missing = blocks.filter((b) => !blockTimes.has(`${rpcUrl}|${b}`));
    if (!missing.length) return;
    let alive = true;
    const pub = publicClientFor(rpcUrl);
    void Promise.allSettled(
      missing.map(async (b) => {
        const block = await pub.getBlock({ blockNumber: b });
        blockTimes.set(`${rpcUrl}|${b}`, Number(block.timestamp));
      }),
    ).then(() => {
      if (alive) setTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpcUrl, key]);
  const out = new Map<bigint, number>();
  for (const b of blocks) {
    const t = blockTimes.get(`${rpcUrl}|${b}`);
    if (t !== undefined) out.set(b, t);
  }
  return out;
}
