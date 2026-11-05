---
id: security
title: Security and known limits
---

# Security and known limits

The product is a promise that a buyer will be there. The worst failures are a buyer slipping away, capacity counted twice, or the asset landing in a wallet it may not go to.

**Standby is a hackathon build on a testnet. It has not been audited.**

## Threat table

| Threat | Mitigation | Priority |
| --- | --- | --- |
| Buyer pulls USDT just before a default | Exits only after the notice period; reserved USDT is never withdrawable while its loan is open | P0 |
| Buyer raises the discount to make the bid worthless | Discount is fixed per bid; changing it means exiting and re-posting; capped at 8% | P0 |
| Same bid counted for two loans | Reservations are stored per bid and per loan; free capacity excludes reserved USDT | P0 |
| Bid that unlocks before the loan ends counted as capacity | Free capacity counts a bid in exit only if it unlocks after maturity plus grace | P0 |
| Asset delivered to a wallet off the allowlist | The asset contract checks both sides of every transfer; buyers must hold the buyer role to post a bid; shares owed to an off-list account are held as a claim | P0 |
| Stale or manipulated NAV | NAV older than the limit blocks new loans; only the issuer may post; P1 adds a maximum change per update | P0, P1 |
| Issuer pauses the asset during a default | `repay` and `settle` revert while paused and resume after; stated as a known limit | Known limit |
| Rounding drains USDT over many fills | Shares rounded up for the buyer's price, USDT rounded down; tests with odd decimals | P0 |
| Reentrancy through token hooks | Plain ERC-20s, checks-effects-interactions, `nonReentrant` on every function that moves tokens | P0 |
| Keeper offline | `settle` is callable by anyone; the keeper is a convenience | P0 |

## Who can do what

| Actor | Can | Cannot |
| --- | --- | --- |
| Issuer | Set roles, mint to holders, pause, post NAV | Move anyone's tokens or USDT, change market parameters |
| Market | Reserve, release and fill bids; hold collateral | Withdraw a buyer's unreserved USDT; send shares off the allowlist |
| Buyer | Post, exit after notice, withdraw unreserved USDT | Change a bid's discount; withdraw reserved USDT |
| Keeper | Call `settle` | Anything else (anyone can call `settle`) |
| Deployer | Set the bid book's market once | Anything after that |

## Known limits

- **An issuer pause blocks repayment and settlement** until the asset is unpaused.
- **NAV is trusted from the issuer.** Stale NAV blocks new loans, but a wrong fresh NAV is not caught on chain.
- **A shortfall is possible.** If reserved bids cannot cover the debt, the market emits `Shortfall` and the pool takes the loss.
- **Settlement needs a fresh NAV.** Fills are priced from NAV, so both triggers need it. A stale NAV delays settlement until the issuer posts again.
- **A lender can withdraw before a pending shortfall is realised (F6).** Settlement is permissionless and the keeper settles within one poll, so the window is short.
- **No minimum interest period (F7).** Opening and repaying in one block costs no interest, and holding all capacity is cheap for an allowlisted holder in the demo.
- **No audit.**

## Review findings and fixes

An independent review of the contracts and keeper found the issues below. F6 and F7 are left open and listed under known limits.

| ID | Finding | Fix |
| --- | --- | --- |
| F1 | A revoked borrower could lock a loan, because returning collateral reverted | Collateral owed to an account off the allowlist is held as a claim (`claimableShares`) and collected with `claimShares` |
| F2 | A skipped revoked buyer left lenders short while the borrower kept the collateral | Every reservation is filled. A revoked buyer's shares are held as a claim |
| F3 | Dust bids could fill the 32-slot book | At most 4 open bids per buyer, notice capped at 30 days, and `evict` frees a revoked buyer's slot |
| F4 | The keeper gave up on a loan for good after 3 failures | It backs off for 5 minutes, then retries, and reports it in `/api/health` under `keeper` |
| F5 | Settlement could happen at a stale NAV | Settlement waits for a fresh NAV |
| F6 | A lender can withdraw before a pending shortfall is realised | Open: settlement is permissionless and the keeper settles within one poll |
| F7 | Open-and-repay in one block costs no interest, and holding all capacity is cheap for an allowlisted holder | Open: no minimum interest period in the demo |
| F8 | The read API could starve the keeper's RPC | A 2 second response cache and separate RPC clients |
| F9 | Slow receipts could cause a duplicate `settle` | The keeper follows the pending transaction and never re-sends it |
| F10 | A blacklisted buyer could block repayment | The commitment fee is held as a claim (`claimableFees`) if the transfer fails |

## Not handled in the hackathon build

- Real investor verification (KYC).
- Securities law for lending against fund shares.
- Redemption with the issuer.
- An audit.

## Design rules that matter

- Parameters are immutable. There is no admin withdraw and no upgrade path.
- Never trust that USDT has 6 decimals. Read `decimals()` at runtime.
- Only the official test USDT counts. Self-minted stablecoins do not.
- The deploy script uses throwaway testnet keys only. Never use a key that has held real funds.
