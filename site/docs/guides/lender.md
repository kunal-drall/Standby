---
id: lender
title: Lender guide
---

# Lender guide

A lender deposits USDT in the pool and earns interest on loans whose collateral already has a committed buyer.

## Steps

1. Approve the market to spend your USDT, then call `deposit(assets)`. You receive pool shares.
2. Watch loans outstanding, interest earned and free cash.
3. Call `withdraw(shares)` to take out USDT that is not lent.

## How pool shares work

- On deposit: `shares = assets * (totalShares + 1) / (totalAssets + 1)`, rounded down.
- On withdraw: `assets = shares * (totalAssets + 1) / (totalShares + 1)`, rounded down.
- `totalAssets` is idle USDT plus outstanding principal plus interest accrued on open loans.
- Idle USDT is tracked internally, so a direct USDT transfer to the market does not change the share price.
- Interest accrues from aggregate sums, so `totalAssets` can differ from the sum of loan `due` values by a few base units of rounding.

## What can go wrong

- **`InsufficientCash`.** `withdraw` reverts if the pool does not hold enough idle USDT. Part of the pool is lent out until loans close.
- **Shortfall.** If the reserved bids cannot cover the debt at settlement, the market emits `Shortfall(loanId, amount)` and the pool bears the loss. The haircut is there to make this unlikely, but it is not impossible.
- **Paused asset.** An issuer pause blocks repayment and settlement until unpaused.
- **Stale NAV.** Settlement needs a fresh NAV, so a default waits for the issuer's next post.

## Why it is safer

Before a loan opens, the market reserves bid USDT worth the debt at the end of grace, divided by (1 minus haircut). You can check the buyers' locked USDT on chain before you lend. See [the math](../math.md).
