---
id: math
title: The limit and settlement math
---

# The limit and settlement math

These formulas are the ones in `docs/interfaces.md` v1.1 and in `StandbyMarket.sol`. All integer divisions round down unless marked `ceil`.

## Formulas

**Collateral value and price limit**

```
value      = collateral * nav / 1e18
priceLimit = value * maxLtvBps / 1e4
```

**Debt at time t** (simple interest)

```
dueAt(t) = principal + principal * rateBps * (t - openedAt) / (1e4 * 365 days)
```

**Capacity needed.** The loan must be covered at the end of grace, after the haircut.

```
needed = ceil( dueAt(maturity + grace) * 1e4 / (1e4 - haircutBps) )
```

`openLoan` calls `bidBook.reserve(loanId, maturity + grace, needed)`. It reverts with `InsufficientCapacity` if the free capacity is short.

**Capacity limit.** The largest principal whose `needed` fits `freeCapacity(maturity + grace)`, with `maturity = now + loanTerm`.

**Maximum borrow**

```
maxBorrow = min(priceLimit, capacityLimit)
```

In symbols: `D <= min(LTVmax * NAV * q, (1 - h) * Cfree(M))`, where D is the debt at opening, q the collateral amount, h the haircut, and Cfree(M) the committed bid USDT not reserved by another loan and still locked past maturity plus grace. The contract solves it for the principal, including interest to the end of grace.

**`openLoan` requires:** a fresh NAV (`StaleNav`), the asset not paused (`AssetPaused`), `principal <= priceLimit` (`AboveLtv`), capacity reserved (`InsufficientCapacity`), and idle USDT of at least the principal (`InsufficientCash`).

**Settleable.** The loan is `Open` and either `now > maturity + grace`, or, with a fresh NAV, `dueAt(now) * 1e4 > value * liqThresholdBps`.

**Settlement.** `remaining = dueAt(now)`. For each reservation, in stored order (lowest discount first):

```
price  = nav * (1e4 - discountBps) / 1e4
take   = min(reserved_i, remaining)
shares = ceil( take * 1e18 / price )
if shares > collateral left:  shares = collateral left;  take = shares * price / 1e18
```

The bid is filled for `take`, the buyer receives `shares`, and the unused part of the reservation is released. After the loop, `Shortfall` is emitted if `remaining > 0`, and leftover collateral returns to the borrower. A reserved bid whose buyer is no longer allowlisted is skipped and its whole reservation is released.

**Repayment.** The borrower pays `dueAt(now)` plus commitment fees:

```
fee_i = reserved_i * commitFeeBps * elapsed / (1e4 * 365 days)
```

Each fee goes to that bid's buyer.

## Worked example

Demo parameters: `maxLtvBps` 8500, `haircutBps` 1000, `rateBps` 800, `loanTerm` 900 s, `grace` 120 s. Inputs are the demo seed script's:

- NAV is 1.02 USDT. With 6 decimals that is `1_020_000`.
- The borrower holds 1,000 shares, which is `1000e18`, and pledges all of them.
- Buyer 1 bids 600 USDT at a 3% discount. Buyer 2 bids 500 USDT at a 5% discount. Both use a 600 s notice and neither is in exit.
- The lender deposits 1,500 USDT in the pool.

The year is 365 days = 31,536,000 seconds. Amounts are in base units, with the USDT value in brackets.

### 1. Price limit

```
value      = 1000e18 * 1_020_000 / 1e18 = 1_020_000_000      (1,020.000000 USDT)
priceLimit = 1_020_000_000 * 8500 / 10_000 = 867_000_000      (867.000000 USDT)
```

### 2. Capacity limit

Free capacity is 600 + 500 = `1_100_000_000`. Both bids unlock after the loan ends, so both count. The loan ends 900 + 120 = 1,020 seconds after opening.

```
maxDue = 1_100_000_000 * (10_000 - 1000) / 10_000 = 990_000_000
d      = 10_000 * 31_536_000 = 315_360_000_000
k      = 800 * 1020 = 816_000
p      = maxDue * d / (d + k) = 989_997_438
```

The contract then checks whether `p + 1` still fits: `dueAt(end)` for 989,997,439 is 990,000,000 or less, so it does. The capacity limit is **989,997,439** (989.997439 USDT).

### 3. Maximum borrow

```
maxBorrow = min(867_000_000, 989_997_439) = 867_000_000        (867.000000 USDT)
```

The price limit is lower, so it binds. This matches `previewLimits(1000e18)` on the demo deployment. Capacity would bind if the bids were smaller.

### 4. Open a loan for 867 USDT

```
interest to end of grace = 867_000_000 * 800 * 1020 / 315_360_000_000
                         = 707_472_000_000_000 / 315_360_000_000 = 2243   (rounded down)
dueAt(maturity + grace)  = 867_000_000 + 2_243 = 867_002_243
needed                   = ceil( 867_002_243 * 10_000 / 9000 )
                         = ceil( 963_335_825.56 ) = 963_335_826      (963.335826 USDT)
```

Reservations, lowest discount first. The 3% bid is used up first and the 5% bid supplies the rest:

| Bid | Discount | Reserved |
| --- | --- | --- |
| Buyer 1 | 3% | 600_000_000 (all of it) |
| Buyer 2 | 5% | 363_335_826 |

### 5a. Repay at 600 seconds

```
interest = 867_000_000 * 800 * 600 / 315_360_000_000 = 1319     (rounded down)
due      = 867_001_319
fee_1    = 600_000_000 * 200 * 600 / 315_360_000_000 = 228
fee_2    = 363_335_826 * 200 * 600 / 315_360_000_000 = 138
```

The borrower pays 867,001,319 to the pool plus 366 in fees to the two buyers. The reservations are released and the 1,000 shares return.

### 5b. Default, settled at 1,021 seconds (one second after grace ends)

NAV is unchanged at 1.02.

```
interest  = 867_000_000 * 800 * 1021 / 315_360_000_000 = 708_165_600_000_000 / 315_360_000_000 = 2245
remaining = 867_002_245
```

Buyer 1, 3% discount:

```
price  = 1_020_000 * (10_000 - 300) / 10_000 = 989_400
take   = min(600_000_000, 867_002_245) = 600_000_000
shares = ceil( 600_000_000 * 1e18 / 989_400 ) = 606.428138265615524561e18
remaining = 867_002_245 - 600_000_000 = 267_002_245
```

Buyer 2, 5% discount:

```
price  = 1_020_000 * (10_000 - 500) / 10_000 = 969_000
take   = min(363_335_826, 267_002_245) = 267_002_245
shares = ceil( 267_002_245 * 1e18 / 969_000 ) = 275.544112487100103200e18
remaining = 0
```

Result:

| Item | Amount |
| --- | --- |
| Recovered by the pool | 867.002245 USDT (the full debt, no `Shortfall`) |
| Shares to buyer 1 | 606.428138265615524561 |
| Shares to buyer 2 | 275.544112487100103200 |
| Shares returned to the borrower | 1000 - 881.972250752715627761 = 118.027749247284372239 |
| Buyer 2 reservation released | 363_335_826 - 267_002_245 = 96_333_581 (96.333581 USDT) |

Buyer 1's bid is fully used and closes.

### The early trigger

With a fresh NAV, the loan is also settleable when `dueAt(now) * 1e4 > value * 9000`. For this loan that is a debt above 90% of the collateral value. At a debt of about 867.002 USDT, this happens when the value of 1,000 shares falls below about 963.34 USDT, a NAV below about 0.9633 USDT.

## Why the haircut

The haircut makes the reserved USDT larger than the debt: 963.34 USDT is reserved against a debt of 867.00 USDT. The maximum bid discount is 8% so that a loan defaulting at the 90% threshold is still covered at the bid price.
