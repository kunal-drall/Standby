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

Demo parameters: `maxLtvBps` 8500, `haircutBps` 1000, `rateBps` 800, `loanTerm` 900 s, `grace` 120 s.

Inputs:

- NAV is 1.02 USDT. With 6 decimals that is `1_020_000`.
- The borrower pledges 1,000 shares, which is `1000e18`.
- Two bids: one at a 3% discount and one at a 5% discount.
- **Assumption:** each bid holds 500 USDT (`500_000_000`) and neither is in exit. The repository does not fix bid sizes; these are chosen for the example.

The year is 365 days = 31,536,000 seconds. Amounts below are in base units, with the USDT value in brackets.

### 1. Price limit

```
value      = 1000e18 * 1_020_000 / 1e18 = 1_020_000_000      (1,020.000000 USDT)
priceLimit = 1_020_000_000 * 8500 / 10_000 = 867_000_000      (867.000000 USDT)
```

### 2. Capacity limit

Free capacity is 500 + 500 = `1_000_000_000`. Both bids unlock after the loan ends, so both count.

The loan ends 900 + 120 = 1,020 seconds after opening. The largest principal whose `needed` fits is found as follows.

```
maxDue = 1_000_000_000 * (10_000 - 1000) / 10_000 = 900_000_000
d      = 10_000 * 31_536_000 = 315_360_000_000
k      = 800 * 1020 = 816_000
p      = maxDue * d / (d + k) = 899_997_672                    (899.997672 USDT)
```

The contract then checks whether `p + 1` still fits. It does not, so `capacityLimit` is 899,997,672.

### 3. Maximum borrow

```
maxBorrow = min(867_000_000, 899_997_672) = 867_000_000        (867.000000 USDT)
```

The price limit is lower, so it binds here. With smaller bids, capacity would bind. For example, free capacity of 600 USDT gives `maxDue = 540_000_000` and a capacity limit of 539,998,603 (539.998603 USDT).

### 4. Open a loan for 867 USDT

```
interest to end of grace = 867_000_000 * 800 * 1020 / 315_360_000_000
                         = 707_472_000_000_000 / 315_360_000_000 = 2243   (rounded down)
dueAt(maturity + grace)  = 867_000_000 + 2_243 = 867_002_243
needed                   = ceil( 867_002_243 * 10_000 / 9000 )
                         = ceil( 963_335_825.56 ) = 963_335_826      (963.335826 USDT)
```

Reservations, lowest discount first:

| Bid | Discount | Reserved |
| --- | --- | --- |
| A | 3% | 500_000_000 (all of it) |
| B | 5% | 463_335_826 |

### 5a. Repay at 600 seconds

```
interest = 867_000_000 * 800 * 600 / 315_360_000_000 = 1319     (rounded down)
due      = 867_001_319
fee_A    = 500_000_000 * 200 * 600 / 315_360_000_000 = 190
fee_B    = 463_335_826 * 200 * 600 / 315_360_000_000 = 176
```

The borrower pays 867,001,319 to the pool plus 366 in fees to the two buyers. The reservations are released and the 1,000 shares return.

### 5b. Default, settled at 1,021 seconds (one second after grace ends)

NAV is unchanged at 1.02.

```
interest = 867_000_000 * 800 * 1021 / 315_360_000_000 = 708_165_600_000_000 / 315_360_000_000 = 2245
remaining = 867_002_245
```

Bid A, 3% discount:

```
price  = 1_020_000 * (10_000 - 300) / 10_000 = 989_400
take   = min(500_000_000, 867_002_245) = 500_000_000
shares = ceil( 500_000_000 * 1e18 / 989_400 ) = 505.356781888012937134e18
remaining = 867_002_245 - 500_000_000 = 367_002_245
```

Bid B, 5% discount:

```
price  = 1_020_000 * (10_000 - 500) / 10_000 = 969_000
take   = min(463_335_826, 367_002_245) = 367_002_245
shares = ceil( 367_002_245 * 1e18 / 969_000 ) = 378.743286893704850362e18
remaining = 0
```

Result:

| Item | Amount |
| --- | --- |
| Recovered by the pool | 867.002245 USDT (the full debt, no `Shortfall`) |
| Shares to buyer A | 505.356781888012937134 |
| Shares to buyer B | 378.743286893704850362 |
| Shares returned to the borrower | 1000 - 884.100068781717787496 = 115.899931218282212504 |
| Bid B reservation released | 463_335_826 - 367_002_245 = 96_333_581 (96.333581 USDT) |

Bid A is fully used and closes.

### The early trigger

With a fresh NAV, the loan is also settleable when `dueAt(now) * 1e4 > value * 9000`. For this loan that is a debt above 90% of the collateral value. At a debt of about 867.002 USDT, this happens when the value of 1,000 shares falls below about 963.34 USDT, a NAV below about 0.9633 USDT.

## Why the haircut

The haircut makes the reserved USDT larger than the debt: 963.34 USDT is reserved against a debt of 867.00 USDT. The maximum bid discount is 8% so that a loan defaulting at the 90% threshold is still covered at the bid price.
