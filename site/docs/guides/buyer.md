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
   - You can have at most 4 open bids (`MAX_BIDS_PER_BUYER`), and the book holds at most 32 (`TooManyBids`).
   - `notice` can be at most 30 days (`MAX_NOTICE`), or the call reverts with `NoticeTooLong`.
3. Watch how much of your bid is reserved by loans and how much is free.
4. To leave, call `requestExit(bidId)`. The USDT stays locked until `exitAt`, which is now plus your notice.
5. After `exitAt`, call `withdraw(bidId, amount)` for the unreserved part.

## Rules that bind you

- The discount is fixed. To change it, exit and post a new bid.
- Reserved USDT is never withdrawable while its loan is open. `withdraw` reverts with `ExceedsUnreserved` if you ask for more than the unreserved part.
- Withdrawing before the notice ends reverts with `NoticeNotOver`.
- A bid in exit counts as capacity only for loans that end before it unlocks.
- Commitment fees go straight to your wallet at repayment. If the USDT transfer to you fails, the fee is held and you collect it with `claimFees()` (see `claimableFees`).

## On a default

Reserved bids are filled lowest discount first. For each bid the market takes the smaller of your reservation and the debt still due, and sends you shares at `nav * (1 - discount)`, rounded up in your price. The shares reach you only because you are allowlisted. If you were removed from the allowlist before settlement, your reservation is still filled and your USDT still repays the pool, but the shares are held in the market. Once you are allowed again, call `claimShares()` (see `claimableShares`); it reverts with `NotAllowed` while you are off the list.

If you lose the `BUYER` role, anyone can call `evict(bidId)` to refund the unreserved part of your bid to you.
