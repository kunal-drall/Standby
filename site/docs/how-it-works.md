---
id: how-it-works
title: How Standby works
---

# How Standby works

Five small contracts, one keeper script and one web app. Each contract does one job. The rules live in the contracts. The app and the keeper hold no authority the contracts do not grant to anyone.

## The loan rule

A loan may borrow no more than the lower of two limits:

- **Price limit.** The maximum loan-to-value times the collateral value at the latest NAV.
- **Capacity limit.** The committed bid USDT that is free and still locked until the loan ends (maturity plus grace), after a haircut.

Every reserved dollar belongs to exactly one loan. The formulas and a worked example are on [the math page](./math.md).

## Bids

- A buyer on the allowlist locks USDT with a discount to NAV and a notice period. The bid price is NAV times (1 minus the discount).
- The discount is fixed for the life of the bid. To change it, the buyer exits and posts a new bid. Otherwise a buyer could raise the discount to make the commitment worthless.
- To leave, the buyer requests an exit. The USDT stays locked until the notice period ends.
- A bid in exit counts only for loans that end before it unlocks.
- Reserved USDT cannot be withdrawn, even after notice, until the loan closes.
- Opening a loan reserves capacity from specific bids, lowest discount first.

## Lifecycle

1. **Issuance.** The issuer sets roles on the allowlist, mints shares to the borrower and posts the NAV.
2. **Commitment.** Buyers lock USDT bids. Lenders deposit USDT in the pool.
3. **Open.** The borrower pledges shares. The market checks the NAV is fresh, checks the price limit, reserves bids, takes the shares and sends USDT.
4. **Close, one of two ways.**
   - **Repay.** The borrower pays principal and interest (and the commitment fee) in one transaction and gets the shares back. Reservations are released.
   - **Settle.** After maturity plus grace, or earlier if the debt passes the liquidation threshold, anyone calls `settle`. Each reserved bid pays USDT to the pool and receives shares at its own price. Unused reservations are released and leftover shares go back to the borrower.

Delivery and payment happen in the same transaction, on the same chain. The asset contract refuses any transfer to a wallet that is not on the allowlist, so shares can only reach allowlisted buyers.

## Loan states

A loan starts `Open`. It ends as `Repaid` or `Settled`.

A loan is settleable when the time passes maturity plus grace, or when the debt exceeds the liquidation threshold of the collateral value at a fresh NAV.

## Demo parameters

Production values would be days, not minutes.

| Parameter | Demo value |
| --- | --- |
| Maximum LTV (`maxLtvBps`) | 85% |
| Liquidation threshold (`liqThresholdBps`) | 90% of collateral value |
| Haircut (`haircutBps`) | 10% |
| Maximum bid discount (`maxDiscountBps`) | 8% |
| Minimum bid notice (`minNotice`) | 600 seconds |
| Loan term (`loanTerm`) | 900 seconds |
| Grace (`grace`) | 120 seconds |
| Interest (`rateBps`) | 8% a year, simple |
| Commitment fee (`commitFeeBps`) | 2% a year on reserved USDT, paid to buyers at repayment |
| Maximum NAV age (`maxNavAge`) | 86,400 seconds |

The loan term plus grace is 17 minutes. Parameters are set in the market constructor and are immutable. There is no admin withdraw and no upgrade path.

## Units

- USDT amounts are in token base units. Decimals are read at runtime; never assume 6.
- Asset shares have 18 decimals.
- NAV is USDT base units per 1e18 share units. NAV 1.02 USDT with 6 decimals is `1_020_000`.
- Basis points are `uint16`, with 10,000 meaning 100%.
- Time is `uint40` seconds.
