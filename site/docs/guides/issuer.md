---
id: issuer
title: Issuer guide
---

# Issuer guide

The issuer owns the restricted asset. In the demo the deployer acts as issuer.

## What you get

Your asset becomes usable as loan collateral, because buyers stand behind it.

## What you do

1. **Deploy** the allowlist (`AllowlistRegistry`), the asset (`RestrictedAsset`) and the oracle (`NavOracle`). In the demo the deploy script does this.
2. **Set roles** with `setRoles(account, roles)`. Roles are a bitmask: `HOLDER` = 1, `BUYER` = 2, `CONTRACT` = 4. Any role makes a wallet allowed. Pass 0 to remove a wallet.
   - Borrowers get `HOLDER`.
   - Buyers get `BUYER`.
   - The market and the bid book get `CONTRACT`, so they can hold shares.
3. **Mint** shares with `mint(to, amount)`. The recipient must hold `HOLDER`.
4. **Post the NAV** with `setNav(nav)`. NAV is USDT base units per 1e18 share units. It must be above zero.
5. **Pause** with `pause()` and resume with `unpause()` if you need to stop all movement.

## What can go wrong

- **Stale NAV blocks new loans.** If the latest NAV is older than `maxNavAge` (86,400 seconds in the demo), `openLoan` reverts with `StaleNav`. Post the NAV regularly.
- **A pause blocks settlement.** While the asset is paused, every balance change reverts with `Paused`, so a default cannot settle until you unpause. This is a known limit.
- **Removing a buyer.** A bid whose buyer loses the `BUYER` role no longer counts as capacity. At settlement it is skipped and its reservation is released, so one revoked buyer cannot block a settlement.
- **NAV is trusted.** The market uses your NAV as the price. See [Security and known limits](../security.md).

## What you cannot do

Move anyone's tokens or USDT, or change market parameters.
