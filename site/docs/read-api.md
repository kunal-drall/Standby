---
id: read-api
title: Read API
---

# Read API

The keeper process serves a small JSON API (Hono). It reads chain state and decodes events. It cannot change anything on chain.

All amounts are decimal strings in token base units. Each response has a top-level `decimals` field.

| Method and path | Response |
| --- | --- |
| `GET /api/health` | `{ok, block, navAgeSeconds}` |
| `GET /api/capacity` | `{committed, reserved, free, unlocking: [{bidId, amount, unlocksAt}], navs: {nav, updatedAt}}` |
| `GET /api/bids` | `[{bidId, buyer, amount, reserved, discountBps, notice, exitAt, closed}]` |
| `GET /api/loans` | `[{loanId, borrower, collateral, principal, due, maturity, state, settleable}]` |
| `GET /api/events?fromBlock=` | Decoded events from all five contracts, each with `txHash` and an explorer URL |

## Notes

- `/api/capacity` reports committed, reserved and free bid USDT, the bids that are unlocking (with the time each unlocks), and the latest NAV with its post time. Free capacity follows the contract rule: unreserved USDT in open bids, excluding bids that unlock before the loan ends.
- `/api/loans` returns `state` as the loan state (`None`, `Open`, `Repaid` or `Settled`) and `settleable` as the result of `isSettleable`.
- `/api/events` takes `fromBlock` and returns decoded events from the registry, asset, oracle, bid book and market. Each event carries its `txHash` and an explorer URL (`https://explorer.testnet.whitechain.io/tx/<txHash>`).
- Amounts are decimal strings, so large numbers keep their precision.

The shapes above are the specification in `docs/interfaces.md` section 6. Check the running keeper for exact field types.
