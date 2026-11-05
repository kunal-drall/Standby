// Live chain data: network status (block, chain id, reachability), the shared snapshot that every
// page reads, and a chain clock that ticks each second for countdowns.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CONTRACTS } from '../config';
import { chainIdFor, publicClientFor } from '../lib/clients';
import { readErrorText } from '../lib/errors';
import { loadSnapshot, type Snapshot } from '../lib/snapshot';
import { useSettings } from './settings';

export type NetStatus = {
  state: 'checking' | 'ok' | 'down';
  chainId: number | null;
  blockNumber: bigint | null;
  blockTime: number | null;
  checkedAt: number | null;
  error: string | null;
};

type DataValue = {
  snap: Snapshot | null;
  /** True while the snapshot is for another wallet or RPC than the active one. */
  stale: boolean;
  error: string | null;
  loading: boolean;
  /** Reloads the snapshot; resolves once a load started after this call has finished. */
  refresh: () => Promise<void>;
  status: NetStatus;
  /** Chain time estimate in seconds (latest block time, moved forward by the wall clock). */
  chainNow: () => number;
};

const DataContext = createContext<DataValue | null>(null);
const NowContext = createContext<number>(0);

const SNAPSHOT_MS = 5_000;
const STATUS_MS = 3_000;

export function DataProvider({ children }: { children: ReactNode }) {
  const { effectiveRpcUrl: rpcUrl, active } = useSettings();
  const partyAddress = active?.address ?? null;

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(CONTRACTS !== null);
  const [status, setStatus] = useState<NetStatus>({
    state: 'checking',
    chainId: null,
    blockNumber: null,
    blockTime: null,
    checkedAt: null,
    error: null,
  });

  // Chain clock: offset of chain time over the wall clock, never negative, raised whenever a block
  // shows the chain ahead (a local node after evm_increaseTime).
  const offset = useRef(0);
  const lastBlockTime = useRef(0);
  const observe = useCallback((blockTime: number) => {
    const wall = Date.now() / 1000;
    if (blockTime - wall > offset.current) offset.current = blockTime - wall;
    if (blockTime > lastBlockTime.current) lastBlockTime.current = blockTime;
  }, []);
  const chainNow = useCallback(
    () => Math.max(lastBlockTime.current, Math.floor(Date.now() / 1000 + offset.current)),
    [],
  );

  const latestArgs = useRef({ rpcUrl, partyAddress });
  latestArgs.current = { rpcUrl, partyAddress };
  const inflight = useRef<Promise<void> | null>(null);
  const queued = useRef<Promise<void> | null>(null);

  const runLoad = useCallback((): Promise<void> => {
    const c = CONTRACTS;
    if (!c) return Promise.resolve();
    const { rpcUrl: url, partyAddress: who } = latestArgs.current;
    const p = loadSnapshot(publicClientFor(url), url, c, who)
      .then((s) => {
        observe(s.blockTime);
        const now = latestArgs.current;
        if (now.rpcUrl === url && now.partyAddress === who) {
          setSnap(s);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (latestArgs.current.rpcUrl === url) setError(readErrorText(e));
      })
      .finally(() => {
        if (inflight.current === p) inflight.current = null;
        setLoading(false);
      });
    inflight.current = p;
    return p;
  }, [observe]);

  const refresh = useCallback((): Promise<void> => {
    if (inflight.current) {
      if (!queued.current) {
        queued.current = inflight.current.then(() => {
          queued.current = null;
          return runLoad();
        });
      }
      return queued.current;
    }
    return runLoad();
  }, [runLoad]);

  // Snapshot polling; reload immediately when the RPC or the active wallet changes.
  useEffect(() => {
    if (!CONTRACTS) return;
    setLoading(true);
    void refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, SNAPSHOT_MS);
    return () => window.clearInterval(id);
  }, [rpcUrl, partyAddress, refresh]);

  // Network status polling.
  useEffect(() => {
    let alive = true;
    setStatus((s) => ({ ...s, state: 'checking' }));
    const check = async () => {
      try {
        const pub = publicClientFor(rpcUrl);
        const [chainId, block] = await Promise.all([chainIdFor(rpcUrl), pub.getBlock({ blockTag: 'latest' })]);
        if (!alive) return;
        observe(Number(block.timestamp));
        setStatus({
          state: 'ok',
          chainId,
          blockNumber: block.number,
          blockTime: Number(block.timestamp),
          checkedAt: Date.now(),
          error: null,
        });
      } catch (e) {
        if (!alive) return;
        setStatus((s) => ({ ...s, state: 'down', checkedAt: Date.now(), error: readErrorText(e) }));
      }
    };
    void check();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, STATUS_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [rpcUrl, observe]);

  // Ticking clock for countdowns, in its own context so only consumers re-render.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(() => setNow(chainNow()), 1_000);
    return () => window.clearInterval(id);
  }, [chainNow]);

  const stale = snap !== null && (snap.rpcUrl !== rpcUrl || (snap.party?.address ?? null) !== partyAddress);

  const value = useMemo<DataValue>(
    () => ({ snap, stale, error, loading, refresh, status, chainNow }),
    [snap, stale, error, loading, refresh, status, chainNow],
  );

  return (
    <DataContext.Provider value={value}>
      <NowContext.Provider value={now}>{children}</NowContext.Provider>
    </DataContext.Provider>
  );
}

export function useData(): DataValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData outside DataProvider');
  return value;
}

/** Chain time in seconds, re-rendering each second. */
export function useNow(): number {
  return useContext(NowContext);
}
