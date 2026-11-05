# Standby plan

Living plan. Update it in the same pull request as the work it describes. Newest entries go at the top of each log.

## Status

| | |
|---|---|
| Phase | Build (ETHGlobal Mumbai, from scratch) |
| Deadline | Saturday 7 Nov 2026, 09:00 IST (submit by 08:00) |
| Partner prize | Whitechain, Tokenize track |
| Current milestone | M0 scaffold |
| Last updated | 2026-11-06 02:40 IST |

## Goal

Lenders can lend against a restricted tokenized asset because allowlisted buyers have already locked USDT to buy it on default. Show one repaid loan and one defaulted loan on Whitechain Sepolia, every payment in the official test USDT.

## Milestones

| ID | By (IST) | Milestone | Owner | Status |
|---|---|---|---|---|
| M0 | Fri 03:30 | Repo, docs, interfaces, shared package; first PR merged | Kunal | todo |
| M1 | Fri 05:00 | Deploy-and-verify spike on Whitechain; USDT decimals read | Solidity dev | todo |
| M2 | Fri 10:00 | Five contracts with tests (all P0) | Solidity dev | todo |
| M3 | Fri 12:00 | Deployed, verified, seeded; addresses below | Solidity dev | todo |
| M4 | Fri 16:00 | Web app: party pages on testnet | Swift dev | todo |
| M5 | Fri 16:00 | Keeper settles a defaulted loan | Kunal | todo |
| M6 | Fri 20:00 | End to end: one repaid, one defaulted loan; E2E tests green | All | todo |
| M7 | Fri 23:00 | P1: fees, NAV default, capacity, read API, settings, privacy, docs site | Whoever is free | todo |
| M8 | Sat 02:00 | Freeze; independent review; README; feedback file | Kunal | todo |
| M9 | Sat 05:00 | Video | Kunal | todo |
| M10 | Sat 08:00 | Submitted | Kunal | todo |

## Requirements status

| ID | Requirement | Priority | Status | PR |
|---|---|---|---|---|
| R1 | Restricted asset with allowlist | P0 | todo | |
| R2 | Pause and NAV with staleness | P0 | todo | |
| R3 | Pool deposit and withdraw | P0 | todo | |
| R4 | Post bids (notice, discount limits) | P0 | todo | |
| R5 | Exit after notice, unreserved only | P0 | todo | |
| R6 | Open loan at the lower limit, reserve cheapest first | P0 | todo | |
| R7 | Repay: one transaction | P0 | todo | |
| R8 | Default settlement: one transaction | P0 | todo | |
| R9 | Keeper | P0 | todo | |
| R10 | Web app party pages | P0 | todo | |
| R11 | Commitment fee | P1 | todo | |
| R12 | NAV-based default | P1 | todo | |
| R13 | Capacity readout | P1 | todo | |
| R14 | Pool share price from interest | P1 | todo | |
| R15 | 1inch Aqua quoting (stretch) | P2 | todo | |
| R16 | Gasless actions (stretch) | P2 | todo | |
| R17 | Docs site (Docusaurus) | P1 | todo | |
| R18 | Read API | P1 | todo | |
| R19 | Settings, privacy, terms pages | P1 | todo | |
| R20 | E2E tests (Playwright) against testnet | P0 | todo | |

## Needs Kunal

Items only a human can do. Work continues around them with placeholders; answer when available.

| Opened | Item | Placeholder in use | Answer |
|---|---|---|---|
| 2026-11-06 | Ask ETHGlobal staff: idea from our Nectar research, all code new, origin stated in README; eligible? | README states the origin | |
| 2026-11-06 | Kunal's git email for commit authorship | `KUNAL_GIT_EMAIL` in setup | |

## Decision log

| Date | Decision | Why | Who |
|---|---|---|---|
| 2026-11-06 | Build Standby on Whitechain Sepolia for the Tokenize track; no other partner pick unless the 1inch stretch passes | Only sponsor with a real job in the product | Kunal |
| 2026-11-06 | Demo asset: tokenized T-bill fund share, allowlisted holders, daily NAV | Restricted asset with no DEX exit is the case the product solves | Kunal |
| 2026-11-06 | Market parameters immutable, no admin keys in the market | Fewer trust assumptions; simpler review | Plan |

## Deployed addresses (Whitechain Sepolia, chain 1874)

| Contract | Address | Verified |
|---|---|---|
| AllowlistRegistry | | |
| RestrictedAsset | | |
| NavOracle | | |
| BidBook | | |
| StandbyMarket | | |

## Demo runs

| Date | Lifecycle | Key transactions | Notes |
|---|---|---|---|

## Changelog

| Date | PR | What changed |
|---|---|---|
