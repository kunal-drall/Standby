---
id: keeper
title: Keeper guide
---

# Keeper guide

The keeper settles defaulted loans. It is a convenience: `settle` can be called by anyone, so a keeper being offline does not stop a settlement.

## What the keeper does

1. Polls open loans every 15 seconds.
2. Calls `settle(loanId)` on any loan where `isSettleable(loanId)` is true. That means the time is past maturity plus grace, or the debt is above the liquidation threshold of the collateral value at a fresh NAV.
3. Logs each settlement with its transaction link.
4. Retries a reverted settlement at most three times.

It also serves the [Read API](../read-api.md).

## What the keeper cannot do

Call anything except `settle`. It holds no authority the contracts do not give everyone. In v1 the keeper earns nothing.

## Doing it by hand

If you want to settle a loan yourself, check `isSettleable(loanId)` and call `settle(loanId)`. It reverts with `NotSettleable` if the loan is not due.
