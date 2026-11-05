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
| Asset delivered to a wallet off the allowlist | The asset contract checks both sides of every transfer; buyers must hold the buyer role to post a bid | P0 |
| Stale or manipulated NAV | NAV older than the limit blocks new loans; only the issuer may post; P1 adds a maximum change per update | P0, P1 |
| Issuer pauses the asset during a default | Settlement reverts while paused and resumes after; stated as a known limit | Known limit |
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

- **An issuer pause blocks settlement** until the asset is unpaused.
- **NAV is trusted from the issuer.** Stale NAV blocks new loans, but a wrong fresh NAV is not caught on chain.
- **A shortfall is possible.** If reserved bids cannot cover the debt, the market emits `Shortfall` and the pool takes the loss.
- **Early default needs a fresh NAV.** The NAV-based trigger requires a fresh NAV; the maturity trigger does not.
- **No audit.**

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
