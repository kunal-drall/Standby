// One consistent read of everything the pages show, pinned to a single block. JSON-RPC batching
// turns each phase into one HTTP request. Closed bids and finished loans never change, so they are
// cached and not re-read.
import {
  allowlistRegistryAbi,
  bidBookAbi,
  navOracleAbi,
  restrictedAssetAbi,
  standbyMarketAbi,
  usdtAbi,
} from '@standby/shared';
import type { Address, PublicClient } from 'viem';
import type { Contracts } from '../config';

export type Params = {
  maxLtvBps: number;
  liqThresholdBps: number;
  haircutBps: number;
  rateBps: number;
  commitFeeBps: number;
  loanTerm: number;
  grace: number;
  maxNavAge: number;
};

export type BidView = {
  id: bigint;
  buyer: Address;
  amount: bigint;
  reserved: bigint;
  discountBps: number;
  notice: number;
  exitAt: number;
  closed: boolean;
};

export type LoanView = {
  id: bigint;
  borrower: Address;
  collateral: bigint;
  principal: bigint;
  openedAt: number;
  maturity: number;
  state: number;
  bidIds: readonly bigint[];
  reserved: readonly bigint[];
  /** due(loanId) at the snapshot block. */
  due: bigint;
  /** quoteRepay fees at the snapshot block. */
  fees: bigint;
  settleable: boolean;
};

export type PartyView = {
  address: Address;
  native: bigint;
  usdt: bigint;
  shares: bigint;
  poolShares: bigint;
  poolValue: bigint;
  roles: number;
  /** v1.2: shares held in the market for this account (it was off the allowlist when owed). */
  claimableShares: bigint;
  /** v1.2: commitment fees held for this buyer (the transfer failed at repayment). */
  claimableFees: bigint;
  /** v1.2: BidBook.openBidsOf. */
  openBids: number;
};

export type Snapshot = {
  rpcUrl: string;
  blockNumber: bigint;
  blockTime: number;
  decimals: number;
  usdtSymbol: string;
  assetSymbol: string;
  params: Params;
  maxDiscountBps: number;
  minNotice: number;
  maxNotice: number;
  maxBidsPerBuyer: number;
  nav: bigint;
  navUpdatedAt: number;
  paused: boolean;
  assetSupply: bigint;
  issuer: Address;
  totalAssets: bigint;
  cash: bigint;
  totalPrincipal: bigint;
  totalShares: bigint;
  bids: BidView[];
  openBidIds: readonly bigint[];
  /** now + loanTerm + grace at the snapshot block. */
  freeUntil: number;
  freeForNewLoan: bigint;
  loans: LoanView[];
  /** AllowlistRegistry.roles of each buyer with an open bid (lowercase address). */
  buyerRoles: Record<string, number>;
  party: PartyView | null;
};

const finalBids = new Map<string, BidView>();
const finalLoans = new Map<string, LoanView>();

export async function loadSnapshot(
  pub: PublicClient,
  rpcUrl: string,
  c: Contracts,
  partyAddress: Address | null,
): Promise<Snapshot> {
  const block = await pub.getBlock({ blockTag: 'latest' });
  const blockNumber = block.number;
  const blockTime = Number(block.timestamp);
  const at = { blockNumber } as const;

  const partyReads = partyAddress
    ? Promise.all([
        pub.getBalance({ address: partyAddress, blockNumber }),
        pub.readContract({ address: c.usdt, abi: usdtAbi, functionName: 'balanceOf', args: [partyAddress], ...at }),
        pub.readContract({ address: c.asset, abi: restrictedAssetAbi, functionName: 'balanceOf', args: [partyAddress], ...at }),
        pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'sharesOf', args: [partyAddress], ...at }),
        pub.readContract({ address: c.registry, abi: allowlistRegistryAbi, functionName: 'roles', args: [partyAddress], ...at }),
        pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'claimableShares', args: [partyAddress], ...at }),
        pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'claimableFees', args: [partyAddress], ...at }),
        pub.readContract({ address: c.bidBook, abi: bidBookAbi, functionName: 'openBidsOf', args: [partyAddress], ...at }),
      ])
    : Promise.resolve(null);

  const [
    decimals,
    usdtSymbol,
    assetSymbol,
    rawParams,
    maxDiscountBps,
    minNotice,
    maxNotice,
    maxBidsPerBuyer,
    latest,
    paused,
    assetSupply,
    issuer,
    totalAssets,
    cash,
    totalPrincipal,
    totalShares,
    bidCount,
    loanCount,
    openBidIds,
    party,
  ] = await Promise.all([
    pub.readContract({ address: c.usdt, abi: usdtAbi, functionName: 'decimals', ...at }),
    pub.readContract({ address: c.usdt, abi: usdtAbi, functionName: 'symbol', ...at }).catch(() => 'USDT'),
    pub.readContract({ address: c.asset, abi: restrictedAssetAbi, functionName: 'symbol', ...at }).catch(() => 'shares'),
    pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'params', ...at }),
    pub.readContract({ address: c.bidBook, abi: bidBookAbi, functionName: 'maxDiscountBps', ...at }),
    pub.readContract({ address: c.bidBook, abi: bidBookAbi, functionName: 'minNotice', ...at }),
    pub.readContract({ address: c.bidBook, abi: bidBookAbi, functionName: 'MAX_NOTICE', ...at }),
    pub.readContract({ address: c.bidBook, abi: bidBookAbi, functionName: 'MAX_BIDS_PER_BUYER', ...at }),
    pub.readContract({ address: c.oracle, abi: navOracleAbi, functionName: 'latest', ...at }),
    pub.readContract({ address: c.asset, abi: restrictedAssetAbi, functionName: 'paused', ...at }),
    pub.readContract({ address: c.asset, abi: restrictedAssetAbi, functionName: 'totalSupply', ...at }),
    pub.readContract({ address: c.registry, abi: allowlistRegistryAbi, functionName: 'issuer', ...at }),
    pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'totalAssets', ...at }),
    pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'cash', ...at }),
    pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'totalPrincipal', ...at }),
    pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'totalShares', ...at }),
    pub.readContract({ address: c.bidBook, abi: bidBookAbi, functionName: 'bidCount', ...at }),
    pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'loanCount', ...at }),
    pub.readContract({ address: c.bidBook, abi: bidBookAbi, functionName: 'openBidIds', ...at }),
    partyReads,
  ]);

  const params: Params = {
    maxLtvBps: Number(rawParams.maxLtvBps),
    liqThresholdBps: Number(rawParams.liqThresholdBps),
    haircutBps: Number(rawParams.haircutBps),
    rateBps: Number(rawParams.rateBps),
    commitFeeBps: Number(rawParams.commitFeeBps),
    loanTerm: Number(rawParams.loanTerm),
    grace: Number(rawParams.grace),
    maxNavAge: Number(rawParams.maxNavAge),
  };
  const freeUntil = blockTime + params.loanTerm + params.grace;

  const bidKey = (id: bigint) => `${rpcUrl}|${c.bidBook}|${id}`;
  const loanKey = (id: bigint) => `${rpcUrl}|${c.market}|${id}`;

  const bidIds = Array.from({ length: Number(bidCount) }, (_, i) => BigInt(i));
  const loanIds = Array.from({ length: Number(loanCount) }, (_, i) => BigInt(i));

  const [freeForNewLoan, bids, loans, poolValue] = await Promise.all([
    pub.readContract({ address: c.bidBook, abi: bidBookAbi, functionName: 'freeCapacity', args: [freeUntil], ...at }),
    Promise.all(
      bidIds.map(async (id): Promise<BidView> => {
        const cached = finalBids.get(bidKey(id));
        if (cached) return cached;
        const b = await pub.readContract({ address: c.bidBook, abi: bidBookAbi, functionName: 'getBid', args: [id], ...at });
        const view: BidView = {
          id,
          buyer: b.buyer,
          amount: b.amount,
          reserved: b.reserved,
          discountBps: Number(b.discountBps),
          notice: Number(b.notice),
          exitAt: Number(b.exitAt),
          closed: b.closed,
        };
        if (view.closed) finalBids.set(bidKey(id), view);
        return view;
      }),
    ),
    Promise.all(
      loanIds.map(async (id): Promise<LoanView> => {
        const cached = finalLoans.get(loanKey(id));
        if (cached) return cached;
        const [[loan, ids, reserved], due, [, fees], settleable] = await Promise.all([
          pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'getLoan', args: [id], ...at }),
          pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'due', args: [id], ...at }),
          pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'quoteRepay', args: [id], ...at }),
          pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'isSettleable', args: [id], ...at }),
        ]);
        const view: LoanView = {
          id,
          borrower: loan.borrower,
          collateral: loan.collateral,
          principal: loan.principal,
          openedAt: Number(loan.openedAt),
          maturity: Number(loan.maturity),
          state: Number(loan.state),
          bidIds: ids,
          reserved,
          due,
          fees,
          settleable,
        };
        if (view.state === 2 || view.state === 3) finalLoans.set(loanKey(id), view);
        return view;
      }),
    ),
    party && party[3] > 0n
      ? pub.readContract({ address: c.market, abi: standbyMarketAbi, functionName: 'convertToAssets', args: [party[3]], ...at })
      : Promise.resolve(0n),
  ]);

  const openSet = new Set(openBidIds.map((id) => id.toString()));
  const buyers = [...new Set(bids.filter((b) => openSet.has(b.id.toString())).map((b) => b.buyer.toLowerCase()))];
  const buyerRoleValues = await Promise.all(
    buyers.map((b) =>
      pub.readContract({ address: c.registry, abi: allowlistRegistryAbi, functionName: 'roles', args: [b as Address], ...at }),
    ),
  );
  const buyerRoles: Record<string, number> = {};
  buyers.forEach((b, i) => {
    buyerRoles[b] = Number(buyerRoleValues[i]);
  });

  return {
    rpcUrl,
    blockNumber,
    blockTime,
    decimals: Number(decimals),
    usdtSymbol: usdtSymbol || 'USDT',
    assetSymbol: assetSymbol || 'shares',
    params,
    maxDiscountBps: Number(maxDiscountBps),
    minNotice: Number(minNotice),
    maxNotice: Number(maxNotice),
    maxBidsPerBuyer: Number(maxBidsPerBuyer),
    nav: latest[0],
    navUpdatedAt: Number(latest[1]),
    paused,
    assetSupply,
    issuer,
    totalAssets,
    cash,
    totalPrincipal,
    totalShares,
    bids,
    openBidIds,
    freeUntil,
    freeForNewLoan,
    loans,
    buyerRoles,
    party:
      party && partyAddress
        ? {
            address: partyAddress,
            native: party[0],
            usdt: party[1],
            shares: party[2],
            poolShares: party[3],
            poolValue,
            roles: Number(party[4]),
            claimableShares: party[5],
            claimableFees: party[6],
            openBids: Number(party[7]),
          }
        : null,
  };
}
