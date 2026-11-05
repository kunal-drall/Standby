---
id: faq
title: FAQ
---

# FAQ

## Why would a buyer lock USDT for nothing?

For the commitment fee (a P1 feature, 2% a year on reserved USDT in the demo) and a known discount on a default. This is how standby credit works in banking.

## What if NAV is wrong?

Only the issuer posts it. A stale NAV blocks new loans. A P1 addition limits how much it may change on each update.

## What stops the buyer leaving?

The notice period. Reserved USDT never unlocks while its loan is open.

## Who are the first customers?

An issuer of a restricted fund share, and a lender that wants to raise its cap on it.

## Is this Nectar?

The idea comes from our research for Nectar. The code was written at ETHGlobal Mumbai. No Nectar code, designs or assets are used.

## Why onchain stablecoin settlement?

The asset and the USDT move in one transaction only if both live on the same chain. A bank rail cannot deliver a restricted token against payment atomically, and lenders can verify buyers' locked USDT onchain before they lend.

## Can the shares go to someone who is not allowlisted?

No. The asset contract checks both sides of every transfer. Buyers must hold the buyer role to post a bid, and shares owed to an account that has since left the allowlist are held in the market as a claim until it is allowed again.

## What if nobody settles a defaulted loan?

Anyone can call `settle`. The keeper does it automatically, but it has no special right.

## Can I repay after the grace period?

Yes, until someone settles the loan.

## Is it audited?

No. It is a hackathon build on a testnet.
