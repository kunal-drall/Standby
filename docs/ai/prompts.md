# Standby build prompts

The prompts the team gave the AI coding assistant, one per chunk of work, plus the role each assistant agent played. Kept in the repo because ETHGlobal requires specs, prompts and planning artifacts for spec-driven work.

## Definition of done (applies to every chunk)

1. Tests for the changed code pass; output trimmed to failures and summaries.
2. `docs/plan.md` updated: requirement status, milestone status, a changelog row, and any decision taken.
3. A row added to `docs/ai/AI_USAGE.md`.
4. Work on a feature branch `feat/<short-name>`, small commits as each step goes green, pushed at least hourly.
5. A pull request opened with `gh pr create` using the template, then merged with `gh pr merge --merge --delete-branch` once checks pass.
6. A summary of at most 10 lines: what changed, tests run, links, anything placed under "Needs Kunal".

If a step needs a human (faucet captcha, account login, funding, a policy question), do not wait: use a clearly marked placeholder (`TODO(kunal): ...`), add a row under "Needs Kunal" in `docs/plan.md`, and continue with the next step. Decide everything else yourself and log the decision.

## Chunks

| ID | Chunk | Lane | Needs | Priority |
|---|---|---|---|---|
| C0 | Scaffold | Kunal | — | P0 |
| C1 | Wallets, deploy-and-verify spike | Solidity | C0 | P0 |
| C2 | Registry, asset, oracle | Solidity | C1 | P0 |
| C3 | Bid book | Solidity | C2 | P0 |
| C4 | Market | Solidity | C3 | P0 |
| C5 | Deploy, verify, seed | Solidity | C4 | P0 |
| C6 | Keeper and read API | Kunal | C0 (ABI from spec), C5 for live | P0 / P1 |
| C7 | Web foundation and design system | Web | C0 | P0 |
| C8 | Web party pages | Web | C7, C5 | P0 |
| C9 | End-to-end tests and live check | Kunal | C5, C6, C8 | P0 |
| C10 | P1 features | Solidity + Web | C9 | P1 |
| C11 | Docs site | Kunal | C0 | P1 |
| C12 | Independent review | Solidity | C9 | P0 |
| C13 | README, feedback, submission | Kunal | C9 | P0 |
| C14 | 1inch Aqua stretch | Solidity | C10, before Fri 18:00 only | P2 |

### C0 — scaffold
```
Read docs/interfaces.md sections 1-3 and 7. Create a pnpm workspace:
- packages/shared: constants (section 1), units helpers (section 3), placeholder abi.ts generated later from Foundry out/, deployments.json with empty addresses.
- contracts: forge init, OpenZeppelin 5, empty src files for the five contracts.
- keeper: Node 22 TypeScript skeleton with Hono and viem.
- web: Vite + React + TypeScript skeleton with the routes in section 7 as placeholders.
- site: placeholder folder (Docusaurus comes in C11).
- root: .gitignore (.env*, node_modules, out, cache, broadcast with private data, dist, build), .env.example from section 2, README stub with "Before and during the hackathon".
Done when pnpm -r build and forge build pass. Finish with the definition of done.
```

### C1 — wallets and deploy spike
```
Read docs/interfaces.md sections 1-2. If .env lacks keys, create six fresh testnet wallets with `cast wallet new` and write DEPLOYER_PK, LENDER_PK, BUYER1_PK, BUYER2_PK, BORROWER_PK, KEEPER_PK to .env; print only the addresses.
Check WBT and USDT balances for each. Request WBT from the faucet (in the browser if available); if a captcha or login blocks it, add each address to "Needs Kunal" and continue.
Deploy a trivial contract with forge script --broadcast to chain 1874 and verify it with --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/. Read USDT decimals() and record it in docs/plan.md.
Done when the explorer shows verified source. Finish with the definition of done.
```

### C2 — registry, asset, oracle
```
Implement AllowlistRegistry, RestrictedAsset and NavOracle exactly per docs/interfaces.md section 5. Tests: role bitmask, transfer between allowed wallets, transfer to a non-allowed wallet reverts, mint only to HOLDER, pause blocks transfers, setNav only by issuer, latest() returns the timestamp.
Finish with the definition of done.
```

### C3 — bid book
```
Implement BidBook per docs/interfaces.md section 5. Tests: post requires BUYER; discount and notice limits; requestExit sets exitAt; early withdraw reverts; withdraw after notice of unreserved only; freeCapacity excludes reserved and bids unlocking before `until`; reserve picks cheapest discount first and reverts when short; release and fill accounting; onlyMarket; 32-bid cap; fuzz test that sum(reserved) never exceeds sum(amount).
Finish with the definition of done.
```

### C4 — market (plan first, then build)
```
Implement StandbyMarket per docs/interfaces.md sections 4-5, with the math exactly as written. Tests with a mock USDT that has 6 decimals and one with 18: deposit and withdraw shares; previewLimits returns the lower limit; openLoan reverts above priceLimit, above capacity, on stale NAV, when paused, when the pool lacks cash; repay in one transaction returns collateral and releases reservations; settle before maturity+grace reverts; settle after it fills bids cheapest first, sends shares only to allowlisted buyers, returns leftover collateral, emits Shortfall when bids are short; anyone can settle; reentrancy guard on every token-moving function.
Finish with the definition of done.
```

### C5 — deploy, verify, seed
```
Write script/Deploy.s.sol: deploy the five contracts with section 4 demo parameters, wire roles (CONTRACT for market and bid book, HOLDER for borrower, BUYER for both buyers), setMarket on the bid book, verify all five on Blockscout, write addresses to packages/shared/src/deployments.json and .env, export ABIs to packages/shared/src/abi.ts.
Write script/Seed.s.sol: mint 1,000 shares to the borrower, post NAV 1.02 USDT, buyer1 bid at 3% and buyer2 at 5% with 10-minute notice, lender deposit. Size amounts to the USDT the wallets hold; if they hold too little, put the shortfall under "Needs Kunal" and seed what is possible.
Record every address and transaction link in docs/plan.md. Finish with the definition of done.
```

### C6 — keeper and read API
```
Read docs/interfaces.md sections 5-6. In keeper/: poll open loans every 15 s, call settle on any isSettleable, at most three retries, log each settlement with its explorer link. Serve the read API in section 6 with Hono on port 8788, reading contract views and events with viem. Unit-test the response shapes against a local anvil deployment.
Finish with the definition of done.
```

### C7 — web foundation and design system
```
Build the web app shell per docs/interfaces.md section 7 and the design rules in the web agent instructions: design tokens (light and dark) in web/src/styles/tokens.css, layout with header, party switcher, network status and docs link; Overview page explaining the product in plain words with live stats; Settings (RPC URL, active demo wallet, theme, number format); Privacy (testnet demo, what is stored: nothing server-side, local storage only for settings, no analytics); Terms (testnet only, no real value); Activity page reading the event list. Loading, empty and error states everywhere. Works at 375 px wide.
Finish with the definition of done.
```

### C8 — party pages
```
Build /issuer, /lender, /buyer, /borrower and /capacity against the deployed contracts (addresses from packages/shared). Each page: a KPI row, an explainer panel ("what you do here", "what can go wrong"), an action card, and a table of the party's positions. Borrower page shows priceLimit, capacityLimit and the chosen limit with the formula on hover. Buyer page shows reserved vs free per bid and the unlock time. Every action ends with the explorer link.
Finish with the definition of done.
```

### C9 — end-to-end tests and live check
```
Write Playwright tests in web/e2e that run against the deployed testnet contracts: issuer posts NAV; transfer to a non-allowlisted wallet fails; buyers post bids; lender deposits; borrower opens at the lower limit; early buyer withdraw fails; borrower repays; a second loan passes maturity+grace and the keeper settles it; balances match. Assert on text and on-chain state, not screenshots.
Then do one visual pass per page in the browser, at desktop and 375 px, and fix layout bugs. Record the run's transaction links in docs/plan.md under Demo runs.
Finish with the definition of done.
```

### C10 — P1 features
```
Implement R11 commitment fee, R12 NAV-based default, R13 capacity readout and R14 share price in the order listed, each with tests and its UI, each as its own pull request. Stop at Fri 23:00 and mark the rest dropped in docs/plan.md.
```

### C11 — docs site
```
Create site/ with Docusaurus 3 and @docusaurus/theme-mermaid, themed with the same tokens as the web app. Pages: Introduction; How Standby works; Guides for issuer, lender, buyer, borrower; The limit and settlement math; Architecture (reuse docs/ARCHITECTURE.md diagrams); Contracts reference (functions, events, errors from docs/interfaces.md); Read API; Security and known limits; Deployments (addresses and explorer links from packages/shared); FAQ; Glossary. Build with pnpm -C site build.
Finish with the definition of done.
```

### C12 — independent review
```
Review contracts/src and keeper/src against docs/interfaces.md without reading earlier conversation. Look first for any way tokens reach an address other than a lender, buyer or borrower; double-counted capacity; a buyer escaping a commitment; shares reaching a non-allowlisted wallet; rounding that loses USDT; reentrancy. Report at most 15 findings, most severe first, each with a failing scenario and a one-line fix. Then fix them, each fix as its own pull request.
```

### C13 — README, feedback, submission
```
From packages/shared/src/deployments.json and docs/plan.md, write README.md (summary, how it works, architecture link, setup, addresses and explorer links, a transaction table for both lifecycles, why onchain stablecoin settlement on Whitechain, known limits, Before and during the hackathon), WHITECHAIN_FEEDBACK.md from the team's notes (no invented opinions), and docs/SUBMISSION.md (short and long description, video script of 2-4 minutes covering each party). Never invent a value; leave TODO(kunal) where one is missing.
```

### C14 — 1inch Aqua stretch (only if C10 is done before Fri 18:00)
```
Check whether official Aqua and SwapVM contracts can be deployed on Whitechain Sepolia. If yes in under one hour, let unreserved bid USDT also quote the asset to allowlisted takers through a SwapVM program referenced to NAV, without ever touching reserved USDT. If not, record why in docs/plan.md and stop.
```

## Agent roles

| Agent | Scope | Model tier | Instructions in short |
|---|---|---|---|
| contracts | `contracts/`, ABI and deployments in `packages/shared` | strongest | Build exactly the spec; custom errors; checks-effects-interactions; tests per requirement; verify on Blockscout |
| keeper | `keeper/` | mid | Poll, settle, serve the read API; never hold authority the contracts do not give anyone |
| web | `web/` | mid | Clean, information-dense UI from the design rules; every number explained; every action linked to the explorer |
| qa | `web/e2e`, live checks | mid | Playwright against testnet; one visual pass per page; record runs |
| reviewer | read-only | strongest | Fresh-eyes review for fund-loss and rule-bypass bugs |
| docs | README, docs site, submission | small | Write only from facts in the repo |
