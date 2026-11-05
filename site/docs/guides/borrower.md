---
id: borrower
title: Borrower guide
---

# Borrower guide

A borrower is an allowlisted holder of the fund shares who wants cash without selling or redeeming them.

## Steps

1. Get the `HOLDER` role from the issuer and receive shares.
2. Call `previewLimits(collateral)`. It returns the price limit, the capacity limit and the lower of the two (`maxBorrow`). Borrow no more than `maxBorrow`.
3. Approve the market to take your shares, then call `openLoan(collateral, principal)`. Your shares go to the market, USDT comes from the pool, and bid capacity is reserved.
4. Before maturity plus grace, call `quoteRepay(loanId)` to see what is due, approve that USDT, then call `repay(loanId)`. One transaction pays the pool, pays any commitment fee to the buyers, releases the reservations and returns your shares.

## What you pay

- Simple interest at 8% a year in the demo: `principal + principal * rateBps * elapsed / (10_000 * 365 days)`.
- A commitment fee to the buyers: reserved USDT times `commitFeeBps` times elapsed time over a year (2% a year in the demo).

`repay` pulls `dueNow + fees` from you.

## What can go wrong

| Revert | Cause |
| --- | --- |
| `AboveLtv` | Principal is above the price limit |
| `InsufficientCapacity` | The bids cannot cover the reservation you need |
| `InsufficientCash` | The pool does not hold enough idle USDT |
| `StaleNav` | The latest NAV is older than the limit |
| `AssetPaused` | The issuer paused the asset |
| `NotBorrower` | Someone other than the borrower called `repay` |

If you do not repay in time, anyone can settle the loan. Buyers receive shares at their own price until the debt is covered. You get back any leftover shares. You can still repay after maturity plus grace until someone settles the loan.
