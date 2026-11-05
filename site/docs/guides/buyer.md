---
id: buyer
title: Buyer guide
---

# Buyer guide

A buyer stands ready to buy the asset on a default. Buyers can be market makers, funds or the issuer's own treasury.

## What you get

- The asset at a known discount to NAV if a loan defaults.
- A commitment fee for standing ready: 2% a year on reserved USDT in the demo, paid at repayment, pro rata to your reserved USDT and time.

## Steps

1. The issuer gives your wallet the `BUYER` role.
2. Approve the bid book to spend USDT, then call `postBid(amount, discountBps, notice)`.
   - `discountBps` must be at most 800 (8%), or the call reverts with `DiscountTooHigh`.
   - `notice` must be at least 600 seconds, or the call reverts with `NoticeTooShort`.
   - At most 32 bids can be open at once (`TooManyBids`).
3. Watch how much of your bid is reserved by loans and how much is free.
4. To leave, call `requestExit(bidId)`. The USDT stays locked until `exitAt`, which is now plus your notice.
5. After `exitAt`, call `withdraw(bidId, amount)` for the unreserved part.

## Rules that bind you

- The discount is fixed. To change it, exit and post a new bid.
- Reserved USDT is never withdrawable while its loan is open. `withdraw` reverts with `ExceedsUnreserved` if you ask for more than the unreserved part.
- Withdrawing before the notice ends reverts with `NoticeNotOver`.
- A bid in exit counts as capacity only for loans that end before it unlocks.

## On a default

Reserved bids are filled lowest discount first. For each bid the market takes the smaller of your reservation and the debt still due, and sends you shares at `nav * (1 - discount)`, rounded up in your price. The shares reach you only because you are allowlisted. If you lose the `BUYER` role before settlement, your bid is skipped and your reservation is released.
