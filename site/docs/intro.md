---
id: intro
slug: /
title: Introduction
sidebar_label: Introduction
---

# Standby

**Lend against restricted assets, with the buyer lined up first.**

Standby lets lenders lend against a restricted tokenized asset, such as a T-bill fund share that only allowlisted wallets may hold. It works because allowlisted buyers have already locked USDT bids to buy the asset if the loan defaults.

It runs on Whitechain Sepolia (chain ID 1874). Every payment uses the official test USDT. It was built at ETHGlobal Mumbai.

## The problem

Lenders accept tokenized real-world assets but cap them low. When a loan defaults, nobody has committed to buy collateral that only certain wallets may hold.

- A restricted token can only move to allowlisted wallets, so a liquidator cannot sell it on a DEX.
- Fund shares redeem through the issuer on a schedule, not instantly.
- Without a known buyer at a known price, the lender's only safe limit is a low one.

## The idea

The buyer is lined up before the loan is made.

1. Allowlisted buyers lock USDT in bids. Each bid has a fixed discount to NAV and a notice period.
2. A loan can borrow no more than the lower of a price-based limit and the bid capacity it can reserve after a haircut.
3. If the borrower repays, the collateral comes back and the reservations are released.
4. If the loan defaults, the reserved bids pay USDT to the pool and receive the collateral at their own price, in one transaction.

## The four parties

| Party | What they do |
| --- | --- |
| Issuer | Runs the allowlist, mints shares, posts the NAV, can pause transfers |
| Lender | Deposits USDT in the pool and earns interest |
| Buyer | Locks USDT in a bid and buys the collateral at a discount if a loan defaults |
| Borrower | Pledges shares and borrows USDT without selling them |

A keeper, which can be anyone, calls `settle` on defaulted loans. See the [keeper guide](./guides/keeper.md).

## Where to go next

- [How Standby works](./how-it-works.md) for the full flow.
- A guide for each party: [issuer](./guides/issuer.md), [lender](./guides/lender.md), [buyer](./guides/buyer.md), [borrower](./guides/borrower.md).
- [The limit and settlement math](./math.md), with a worked example.
- [Contracts reference](./contracts.md) and [Read API](./read-api.md).
- [Security and known limits](./security.md). Standby is a hackathon build and is not audited.

## Origin

The idea comes from the team's Nectar research. The code in this repository was written at ETHGlobal Mumbai. No Nectar code, designs or assets are used.

## What Standby is not

It is not a token issuer, a DEX, an automated market maker, or a pool that holds every asset. It sits between a lender and the buyers who stand behind the lender's collateral.
