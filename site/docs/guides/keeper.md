---
id: keeper
title: Keeper guide
---

# Keeper guide

The keeper settles defaulted loans. It is a convenience: `settle` can be called by anyone, so a keeper being offline does not stop a settlement.

## What the keeper does

1. Polls open loans every 15 seconds (`POLL_INTERVAL_MS`).
2. For any loan where `isSettleable(loanId)` is true, simulates `settle(loanId)`, then sends it and waits for the receipt. A loan is settleable when the time is past maturity plus grace, or the debt is above the liquidation threshold of the collateral value at a fresh NAV.
3. Logs each settlement as a JSON line with the explorer link.
4. Gives up on a loan after 3 failed attempts (`MAX_SETTLE_ATTEMPTS`).

It also serves the [Read API](../read-api.md) on port 8788. Start it with `pnpm -C keeper start`.

## Configuration

Environment variables are parsed in `keeper/src/config.ts`.

| Variable | Default |
| --- | --- |
| `WC_RPC_URL` | `https://rpc.testnet.whitechain.io` |
| `WC_CHAIN_ID` | 1874 |
| `USDT_ADDRESS`, `REGISTRY_ADDRESS`, `ASSET_ADDRESS`, `ORACLE_ADDRESS`, `BIDBOOK_ADDRESS`, `MARKET_ADDRESS` | From `deployments.json` |
| `START_BLOCK` | From `deployments.json` |
| `KEEPER_PK` | None. Needed to send `settle`; never logged |
| `PORT` | 8788 |
| `POLL_INTERVAL_MS` | 15000 (minimum 1000) |
| `RPC_TIMEOUT_MS` | 10000 |
| `MAX_SETTLE_ATTEMPTS` | 3 (1 to 10) |

## What the keeper cannot do

Call anything except `settle`. It holds no authority the contracts do not give everyone. In v1 the keeper earns nothing.

## Doing it by hand

If you want to settle a loan yourself, check `isSettleable(loanId)` and call `settle(loanId)`. It reverts with `NotSettleable` if the loan is not due.
