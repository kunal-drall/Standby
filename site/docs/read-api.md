---
id: read-api
title: Read API
---

# Read API

The keeper process serves a small JSON API (Hono). It reads chain state and decodes events. It cannot change anything on chain. CORS allows `GET` from any origin.

Default port: 8788. Run it with `pnpm -C keeper start`.

All amounts are decimal strings in token base units. Each response has the USDT `decimals` at the top level. List endpoints wrap the list in an object for that reason.

| Method and path | Response |
| --- | --- |
| `GET /api/health` | `{ok, block, navAgeSeconds}` |
| `GET /api/capacity` | `{decimals, committed, reserved, free, freeUntil, unlocking: [{bidId, amount, unlocksAt}], navs: {nav, updatedAt}}` |
| `GET /api/bids` | `{decimals, bids: [{bidId, buyer, amount, reserved, discountBps, notice, exitAt, closed}]}` |
| `GET /api/loans` | `{decimals, loans: [{loanId, borrower, collateral, principal, due, maturity, state, settleable}]}` |
| `GET /api/events?fromBlock=` | `{decimals, fromBlock, toBlock, events: [{contract, event, args, blockNumber, logIndex, txHash, explorerUrl}]}` |

## Types

These are the exported types in `keeper/src/reader.ts`.

```ts
type Health = { ok: true; block: string; navAgeSeconds: number | null };

type Capacity = {
  decimals: number;
  committed: string;
  reserved: string;
  free: string;
  freeUntil: number;
  unlocking: { bidId: string; amount: string; unlocksAt: number }[];
  navs: { nav: string; updatedAt: number };
};

type BidRow = {
  bidId: string; buyer: Address; amount: string; reserved: string;
  discountBps: number; notice: number; exitAt: number; closed: boolean;
};

type LoanRow = {
  loanId: string; borrower: Address; collateral: string; principal: string;
  due: string; maturity: number; state: string; settleable: boolean;
};

type EventRow = {
  contract: string; event: string;
  args: Record<string, string | number | boolean>;
  blockNumber: string; logIndex: number; txHash: string; explorerUrl: string;
};

type Events = { decimals: number; fromBlock: string; toBlock: string; events: EventRow[] };
```

## Notes

- `navAgeSeconds` is `null` before the first NAV post.
- `free` is `freeCapacity(freeUntil)`, where `freeUntil = now + loanTerm + grace`. It is the capacity a loan opened now can use. `committed` and `reserved` sum the open bids.
- `unlocking` lists bids in exit with their unreserved amount and the time each unlocks, earliest first.
- `state` in `/api/loans` is the loan state name (`None`, `Open`, `Repaid`, `Settled`). `settleable` is the result of `isSettleable`.
- `/api/events` scans at most 50,000 blocks from `fromBlock` (default: the deployment's start block). To page, call again with `fromBlock = toBlock + 1`. `explorerUrl` links the transaction on `https://explorer.testnet.whitechain.io`.
- Contract names in `contract` are `AllowlistRegistry`, `RestrictedAsset`, `NavOracle`, `BidBook` and `StandbyMarket`.

## Errors

Errors are `{ok: false, error}`.

| Status | When |
| --- | --- |
| 503 | The chain cannot be read, or contracts are not deployed or addresses are not configured |
| 400 | `fromBlock` is not a block number |
| 404 | Unknown path |
