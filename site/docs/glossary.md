---
id: glossary
title: Glossary
---

# Glossary

**Allowlist.** The registry of wallets the issuer permits to hold the asset. Roles are `HOLDER`, `BUYER` and `CONTRACT`. The asset refuses any transfer where either side is not on it.

**Capacity.** The USDT in open bids that can back loans. Committed is all locked bid USDT. Reserved is the part held for open loans. Free is the rest that is still locked past the loan's maturity plus grace.

**Commitment fee.** What the borrower pays buyers for standing ready: reserved USDT times `commitFeeBps` times elapsed time over a year. Paid at repayment.

**Delivery versus payment.** The asset and the money change hands in the same transaction, or neither does. Default settlement works this way.

**Grace period.** The time after maturity (120 seconds in the demo) before a loan can be settled.

**Haircut.** The share (10% in the demo) by which reserved bid USDT must exceed the debt it backs. It sets the capacity limit.

**NAV.** Net asset value: the issuer-posted price of one share, in USDT base units per 1e18 share units.

**Notice period.** The time a buyer must wait between requesting an exit and withdrawing (at least 600 seconds in the demo).

**Reservation.** USDT in a bid set aside for one loan. It cannot be withdrawn or used by another loan until the loan closes.

**Settlement.** The one-transaction close of a defaulted loan: reserved bids pay the pool, buyers receive shares at their price, leftover shares return to the borrower.
