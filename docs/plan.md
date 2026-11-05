# Standby plan

Living plan. Update it in the same pull request as the work it describes. Newest entries go at the top of each log.

## Status

| | |
|---|---|
| Phase | Build (ETHGlobal Mumbai, from scratch) |
| Deadline | Saturday 7 Nov 2026, 09:00 IST (submit by 08:00) |
| Partner prize | Whitechain, Tokenize track |
| Current milestone | M0 scaffold: built on branch, waiting for `main` and the first merge |
| Last updated | 2026-11-06 02:51 IST |

## Goal

Lenders can lend against a restricted tokenized asset because allowlisted buyers have already locked USDT to buy it on default. Show one repaid loan and one defaulted loan on Whitechain Sepolia, every payment in the official test USDT.

## Milestones

| ID | By (IST) | Milestone | Owner | Status |
|---|---|---|---|---|
| M0 | Fri 03:30 | Repo, docs, interfaces, shared package; first PR merged | Kunal | in review: `pnpm -r build`, `pnpm -r test`, `forge build` pass; merge pending |
| M1 | Fri 05:00 | Deploy-and-verify spike on Whitechain; USDT decimals read | Solidity dev | started: USDT `decimals()` = 6 read on chain; deploy and verify to do |
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
| R10 | Web app party pages | P0 | started: route placeholders | |
| R11 | Commitment fee | P1 | todo | |
| R12 | NAV-based default | P1 | todo | |
| R13 | Capacity readout | P1 | todo | |
| R14 | Pool share price from interest | P1 | todo | |
| R15 | 1inch Aqua quoting (stretch) | P2 | todo | |
| R16 | Gasless actions (stretch) | P2 | todo | |
| R17 | Docs site (Docusaurus) | P1 | todo | |
| R18 | Read API | P1 | started: `GET /api/health` | |
| R19 | Settings, privacy, terms pages | P1 | todo | |
| R20 | E2E tests (Playwright) against testnet | P0 | todo | |

## Needs Kunal

Items only a human can do. Work continues around them with placeholders; answer when available.

| Opened | Item | Placeholder in use | Answer |
|---|---|---|---|
| 2026-11-06 | The repo had no `main`. Approve creating `main` from the first commit (`chore: specs and plan`) and merging the scaffold branch into it as the first PR | Scaffold sits on branch `claude/zen-ptolemy-90yxwn` | |
| 2026-11-06 | Spec gaps in `interfaces.md` v1 (team decision, frozen spec): (a) event `Reserved` has `loanId` but `BidBook.reserve()` takes none; (b) no `paused()` view on RestrictedAsset; (c) no pool-share balance view or loan count on StandbyMarket for the lender page and the keeper | Shared ABIs follow the spec as written; keeper can find loans from `LoanOpened` events | |
| 2026-11-06 | Local kit files not received: `.claude/agents/*`, `.claude/settings.json`, `.claude/hooks/filter-output.sh` | Agent roles in `docs/ai/prompts.md` | |
| 2026-11-06 | Ask ETHGlobal staff: idea from our Nectar research, all code new, origin stated in README; eligible? | README states the origin | |
| 2026-11-06 | Kunal's git email for commit authorship | `KUNAL_GIT_EMAIL` in setup | Used the public email on the kunal-drall GitHub profile; replace with `git config user.email` if another is wanted |

## Decision log

| Date | Decision | Why | Who |
|---|---|---|---|
| 2026-11-06 | Use only `https://rpc.testnet.whitechain.io`; `rpc-testnet.whitechain.io` (hyphen) answers chain 2625, a different network | Checked with `eth_chainId`: 0x752 = 1874 vs 0xa41 = 2625 | Scaffold |
| 2026-11-06 | Foundry: solc 0.8.28 (sources `^0.8.24`), `evm_version = "cancun"`; forge-std v1.17.0 and OpenZeppelin v5.6.1 as root git submodules | Testnet blocks carry Cancun and Prague fields (client op-reth); submodules are the Foundry default. C1 confirms by deploying | Scaffold |
| 2026-11-06 | Placeholder ABIs in `packages/shared/src/abi.ts` hand-written from the spec with viem `parseAbi`; C5 replaces them with Foundry output | Keeper (C6) and web (C7) can start before contracts exist | Scaffold |
| 2026-11-06 | Pinned stable majors: TypeScript 5.9, Vite 7, React 19, react-router 7, viem 2.57, Hono 4, zod 4, vitest 3 | Avoid migration surprises from the newest majors (Vite 8, vitest 5, react-router 8) during a 30-hour build | Scaffold |
| 2026-11-06 | `packages/shared` builds to `dist/` and is consumed by keeper and web; `deployments.json` holds `chainId`, `usdt`, `startBlock` and the five addresses | One source for addresses; `startBlock` bounds event scans | Scaffold |
| 2026-11-06 | CI on GitHub Actions: pnpm build and test, forge build and test, on every PR | "Merge when checks pass" needs checks | Scaffold |
| 2026-11-06 | MIT licence | PRD submission package asks for an open licence | Scaffold |
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
| 2026-11-06 | scaffold (branch `claude/zen-ptolemy-90yxwn`) | C0: specs, plan and PRD export committed; pnpm workspace; `packages/shared` (constants, units, math, spec ABIs, empty deployments); keeper skeleton with `/api/health`; web shell with section 7 routes; Foundry project with five placeholder contracts; site placeholder; CI; README stub with "Before and during the hackathon"; MIT licence |
