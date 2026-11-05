import {
  allowlistRegistryAbi,
  bidBookAbi,
  loanStateName,
  navOracleAbi,
  restrictedAssetAbi,
  standbyMarketAbi,
  txUrl,
  usdtAbi,
} from '@standby/shared';
import { decodeEventLog, type Abi, type Address, type Log, type PublicClient } from 'viem';
import type { Addresses } from './config.js';

// Read API data, docs/interfaces.md section 6. Every amount is a base-unit decimal string; each
// response carries the USDT `decimals` at the top level.

export type Health = { ok: true; block: string; navAgeSeconds: number | null };

export type Capacity = {
  decimals: number;
  committed: string;
  reserved: string;
  free: string;
  freeUntil: number;
  unlocking: { bidId: string; amount: string; unlocksAt: number }[];
  navs: { nav: string; updatedAt: number };
};

export type BidRow = {
  bidId: string;
  buyer: Address;
  amount: string;
  reserved: string;
  discountBps: number;
  notice: number;
  exitAt: number;
  closed: boolean;
};

export type LoanRow = {
  loanId: string;
  borrower: Address;
  collateral: string;
  principal: string;
  due: string;
  maturity: number;
  state: string;
  settleable: boolean;
};

export type EventRow = {
  contract: string;
  event: string;
  args: Record<string, string | number | boolean>;
  blockNumber: string;
  logIndex: number;
  txHash: string;
  explorerUrl: string;
};

export type Events = { decimals: number; fromBlock: string; toBlock: string; events: EventRow[] };

export interface Reader {
  health(): Promise<Health>;
  capacity(): Promise<Capacity>;
  bids(): Promise<{ decimals: number; bids: BidRow[] }>;
  loans(): Promise<{ decimals: number; loans: LoanRow[] }>;
  events(fromBlock?: bigint): Promise<Events>;
}

/** Largest block span one /api/events call scans; callers page with the returned toBlock. */
export const MAX_EVENT_SPAN = 50_000n;
const LOG_CHUNK = 5_000n;

function jsonArgs(args: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (args && typeof args === 'object') {
    for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
      out[k] = typeof v === 'bigint' ? v.toString() : (v as string | number | boolean);
    }
  }
  return out;
}

export function createReader(client: PublicClient, a: Addresses, startBlock: bigint): Reader {
  let decimals: number | undefined;
  const usdtDecimals = async () =>
    (decimals ??= Number(await client.readContract({ address: a.usdt, abi: usdtAbi, functionName: 'decimals' })));

  const abiByAddress = new Map<string, { name: string; abi: Abi }>([
    [a.registry.toLowerCase(), { name: 'AllowlistRegistry', abi: allowlistRegistryAbi as Abi }],
    [a.asset.toLowerCase(), { name: 'RestrictedAsset', abi: restrictedAssetAbi as Abi }],
    [a.oracle.toLowerCase(), { name: 'NavOracle', abi: navOracleAbi as Abi }],
    [a.bidBook.toLowerCase(), { name: 'BidBook', abi: bidBookAbi as Abi }],
    [a.market.toLowerCase(), { name: 'StandbyMarket', abi: standbyMarketAbi as Abi }],
  ]);

  const getBid = (id: bigint) =>
    client.readContract({ address: a.bidBook, abi: bidBookAbi, functionName: 'getBid', args: [id] });

  return {
    async health() {
      const [block, latestBlock, [, updatedAt]] = await Promise.all([
        client.getBlockNumber({ cacheTime: 0 }),
        client.getBlock(),
        client.readContract({ address: a.oracle, abi: navOracleAbi, functionName: 'latest' }),
      ]);
      const navAgeSeconds = updatedAt === 0 ? null : Math.max(0, Number(latestBlock.timestamp) - updatedAt);
      return { ok: true, block: block.toString(), navAgeSeconds };
    },

    async capacity() {
      const [dec, block, openIds, params, [nav, updatedAt]] = await Promise.all([
        usdtDecimals(),
        client.getBlock(),
        client.readContract({ address: a.bidBook, abi: bidBookAbi, functionName: 'openBidIds' }),
        client.readContract({ address: a.market, abi: standbyMarketAbi, functionName: 'params' }),
        client.readContract({ address: a.oracle, abi: navOracleAbi, functionName: 'latest' }),
      ]);
      const freeUntil = Number(block.timestamp) + params.loanTerm + params.grace;
      const [bids, free] = await Promise.all([
        Promise.all(openIds.map((id) => getBid(id).then((b) => ({ id, b })))),
        client.readContract({
          address: a.bidBook,
          abi: bidBookAbi,
          functionName: 'freeCapacity',
          args: [freeUntil],
        }),
      ]);
      let committed = 0n;
      let reserved = 0n;
      const unlocking: Capacity['unlocking'] = [];
      for (const { id, b } of bids) {
        committed += b.amount;
        reserved += b.reserved;
        if (b.exitAt !== 0) {
          unlocking.push({ bidId: id.toString(), amount: (b.amount - b.reserved).toString(), unlocksAt: b.exitAt });
        }
      }
      unlocking.sort((x, y) => x.unlocksAt - y.unlocksAt);
      return {
        decimals: dec,
        committed: committed.toString(),
        reserved: reserved.toString(),
        free: free.toString(),
        freeUntil,
        unlocking,
        navs: { nav: nav.toString(), updatedAt },
      };
    },

    async bids() {
      const [dec, count] = await Promise.all([
        usdtDecimals(),
        client.readContract({ address: a.bidBook, abi: bidBookAbi, functionName: 'bidCount' }),
      ]);
      const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
      const rows = await Promise.all(
        ids.map(async (id) => {
          const b = await getBid(id);
          return {
            bidId: id.toString(),
            buyer: b.buyer,
            amount: b.amount.toString(),
            reserved: b.reserved.toString(),
            discountBps: b.discountBps,
            notice: b.notice,
            exitAt: b.exitAt,
            closed: b.closed,
          } satisfies BidRow;
        }),
      );
      return { decimals: dec, bids: rows };
    },

    async loans() {
      const [dec, count] = await Promise.all([
        usdtDecimals(),
        client.readContract({ address: a.market, abi: standbyMarketAbi, functionName: 'loanCount' }),
      ]);
      const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
      const rows = await Promise.all(
        ids.map(async (id) => {
          const [[loan], due, settleable] = await Promise.all([
            client.readContract({ address: a.market, abi: standbyMarketAbi, functionName: 'getLoan', args: [id] }),
            client.readContract({ address: a.market, abi: standbyMarketAbi, functionName: 'due', args: [id] }),
            client.readContract({ address: a.market, abi: standbyMarketAbi, functionName: 'isSettleable', args: [id] }),
          ]);
          return {
            loanId: id.toString(),
            borrower: loan.borrower,
            collateral: loan.collateral.toString(),
            principal: loan.principal.toString(),
            due: due.toString(),
            maturity: loan.maturity,
            state: loanStateName(loan.state),
            settleable,
          } satisfies LoanRow;
        }),
      );
      return { decimals: dec, loans: rows };
    },

    async events(fromBlock?: bigint) {
      const [dec, latest] = await Promise.all([usdtDecimals(), client.getBlockNumber({ cacheTime: 0 })]);
      const from = fromBlock !== undefined && fromBlock > startBlock ? fromBlock : startBlock;
      const to = from + MAX_EVENT_SPAN - 1n < latest ? from + MAX_EVENT_SPAN - 1n : latest;
      const logs: Log[] = [];
      for (let start = from; start <= to; start += LOG_CHUNK) {
        const end = start + LOG_CHUNK - 1n < to ? start + LOG_CHUNK - 1n : to;
        logs.push(
          ...(await client.getLogs({ address: [...abiByAddress.keys()] as Address[], fromBlock: start, toBlock: end })),
        );
      }
      const events: EventRow[] = [];
      for (const log of logs) {
        const source = abiByAddress.get(log.address.toLowerCase());
        if (!source || !log.transactionHash) continue;
        try {
          const decoded = decodeEventLog({ abi: source.abi, data: log.data, topics: log.topics });
          events.push({
            contract: source.name,
            event: decoded.eventName ?? 'unknown',
            args: jsonArgs(decoded.args),
            blockNumber: (log.blockNumber ?? 0n).toString(),
            logIndex: log.logIndex ?? 0,
            txHash: log.transactionHash,
            explorerUrl: txUrl(log.transactionHash),
          });
        } catch {
          // not one of our events (e.g. an OpenZeppelin event outside the ABI); skip
        }
      }
      return { decimals: dec, fromBlock: from.toString(), toBlock: to.toString(), events };
    },
  };
}
