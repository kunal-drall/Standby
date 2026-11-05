# Standby — Product Requirements

Nov 6, 2026 · Kunal Drall. Exported from the team's product requirements document; the build itself is specified by [`docs/interfaces.md`](../interfaces.md).

## Summary

Standby lets lenders lend against restricted tokenized assets by lining up committed buyers first. Allowlisted buyers lock USDT bids that cannot be withdrawn before a notice period ends; a loan's limit is capped by the bids it reserves; and if the loan defaults, the asset goes to those buyers and their USDT repays the lender in one transaction.

|  |  |
| --- | --- |
| One line | The buyer is lined up before the loan is made |
| Demo asset | A tokenized Treasury-bill fund share that only allowlisted wallets may hold, priced at a daily NAV |
| Chain | Whitechain Sepolia (chain 1874), every payment in the official test USDT |
| Partner pick | Whitechain, Tokenize track ($2,500 first, $1,500 second). One pick: no other sponsor has a job in the product (see the sponsor section) |
| Track | Classic, from scratch: all code written at the event |
| Origin | The mechanism is adapted from Lemma Labs' Nectar research. No Nectar code, designs or assets are used, and the README says so |
| Odds (my estimate, not data) | 25–40% for a Whitechain prize; 2–5% for the finals |

**Why this fits the Tokenize track**

- Its idea list includes short-term lending where the asset and the stablecoin move in one transaction. That is Standby's default settlement.
- It asks for transfer rules enforced in the contract: allowlists, transfer restrictions, maturity and settlement conditions. Standby has all four.
- It asks for a clear issuer and investor and a full lifecycle in the demo. Standby has an issuer, a lender, a buyer and a borrower, from issuance to settlement.

**What Standby is not:** a token issuer, a DEX, an automated market maker, or a pool that holds every asset. It sits between a lender and the buyers who stand behind the lender's collateral.

## Problem and evidence

Lenders accept tokenized real-world assets but cap them low, because when a loan defaults nobody has committed to buy collateral that only certain wallets may hold. The figures below come from Kunal's Nectar Direction Review of 5 November 2026, which lists its sources; they were not re-checked for this document.

- **Restricted assets need gated markets.** Aave Horizon runs RWAs in a separate market whose collateral suppliers must be allowlisted by the issuer, with about $550M of net deposits in early 2026.
- **Lenders open collateral with borrowing switched off.** Venus listed tokenized stocks as collateral in June 2026 with the borrow cap set to zero, before liquidation was proven.
- **Tokenized assets mostly sit idle.** RedStone finds about 0.1% of Stellar's roughly $4.1B of tokenized RWAs is used as DeFi collateral.
- **Risk models assume a buyer nobody has committed.** Aave's model for its stock-token market assumes a liquidator can sell or hedge tokens that secondary holders cannot redeem, into $0.27–1.08M of depth per token.

**Why the exit is the problem**

- A restricted token can only move to allowlisted wallets, so a liquidator cannot dump it on a DEX.
- Fund shares redeem through the issuer on a schedule, not instantly.
- Without a known buyer at a known price, the lender's only safe limit is a low one.

**Earlier attempts**, also from the review and the Nectar brief: B.Protocol offered Aave a committed liquidator in 2021 and the proposal got one reply; Ajna holds about $47K; Silo V3 does not say who funds its collateral swaps. Each made lenders double as buyers or hid where the exit money came from. Standby puts buyers in their own escrowed, priced and time-locked layer that the loan reads when it opens.

## Users, parties and business model

Five parties take part, and the demo shows each one, as Whitechain's rules require.

| Party | Example | What they get | What they give |
| --- | --- | --- | --- |
| Issuer | A fund manager issuing tokenized T-bill shares | Its asset becomes usable as loan collateral | Runs the allowlist, posts the NAV, can pause transfers |
| Lender | A stablecoin holder or credit fund | Interest on loans whose collateral already has a committed buyer | USDT deposited in the lending pool |
| Buyer | A market maker, fund or the issuer's own treasury | The asset at a known discount to NAV, plus a commitment fee for standing ready (P1) | USDT locked in a bid with a notice period |
| Borrower | An allowlisted holder of the fund shares | Cash without selling or redeeming the shares | Collateral, interest, and the commitment fee |
| Keeper | Anyone; a script in the demo | Nothing in v1; a fee later | Calls settlement when a loan defaults |

**Business model (hypothesis, from the Nectar brief's reasoning)**

- Borrowers pay for limits that exist only because buyers committed. Part of that premium pays buyers' commitment fees; Standby keeps a spread.
- Lenders get a safer book; the first customer is a lender or issuer, not a depositor.
- The capacity readout (committed, reserved and free bids per asset) is what risk teams read before raising caps.

**What a user should be able to do after the hackathon**

An issuer of a restricted fund share invites three buyers, each locks a bid, and a lender opens borrowing against the shares with limits backed by those bids. That is the pilot to sell, and it needs no new code beyond mainnet deployment and audits.

## Mechanism

A loan may borrow no more than the lower of a price-based limit and the committed bids it can reserve after a haircut, and every reserved dollar belongs to exactly one loan.

```latex
D \le \min\left(\mathrm{LTV}_{max} \cdot \mathrm{NAV} \cdot q,\ (1-h) \cdot C_{free}(M)\right)
```

D is the debt at opening, q the collateral amount, NAV the issuer's latest price per share, h the haircut, and C\_free(M) the committed bid USDT not yet reserved by another loan and still locked past the loan's maturity M plus the grace period. It is the Nectar formula with only the committed-quote term, because a restricted asset has no DEX depth to count.

**Bids**

- A buyer on the allowlist locks USDT with a discount to NAV and a notice period. The bid's price is NAV × (1 − discount).
- To leave, the buyer requests an exit; the USDT stays locked until the notice period ends. A bid in exit counts only for loans that end before it unlocks.
- The discount is fixed for the life of the bid: to change it, the buyer exits and posts a new bid. Otherwise a buyer could raise the discount to 99% and the commitment would mean nothing.
- Opening a loan reserves capacity from specific bids, cheapest discount first. Reserved USDT cannot be withdrawn, even after notice, until the loan closes.

**Settlement, both ways in one transaction**

- **Repayment:** the borrower pays principal plus interest in USDT to the pool, the collateral returns to the borrower, and the reservations are released.
- **Default** (maturity plus grace passes unpaid, or NAV falls below the loan's liquidation threshold): each reserved bid pays USDT to the pool and receives collateral at its own price, until the debt is covered. Leftover collateral returns to the borrower. The asset contract itself refuses any transfer to a wallet that is not on the allowlist.

**Parameters for the demo** (production values would be days, not minutes)

| Parameter | Demo value |
| --- | --- |
| Maximum LTV | 85% |
| Liquidation threshold | 90% of collateral value |
| Haircut h | 10% |
| Minimum bid notice | 10 minutes |
| Loan term | 15 minutes |
| Grace period | 2 minutes |
| Interest | 8% a year, simple |
| Commitment fee (P1) | 2% a year on reserved USDT, paid at repayment |
| Maximum bid discount | 8%, so a loan defaulting at the 90% threshold is still covered at the bid price |

## Scope and requirements

P0 is the demo and the Tokenize qualification; P1 makes it competitive; P2 waits unless time is left.

**In scope:** one restricted asset, one lending pool, Whitechain Sepolia, official test USDT, a web app with a view per party, a keeper script.

**Out of scope:** mainnet, real KYC, redemption with the issuer, several assets, a DEX route, governance, a token.

| ID | Requirement | Priority | Done when |
| --- | --- | --- | --- |
| R1 | Issuer deploys the restricted asset and manages the allowlist (holder and buyer roles) | P0 | A transfer to a wallet off the list reverts |
| R2 | Issuer can pause transfers and posts NAV with a timestamp; stale NAV blocks new loans | P0 | Opening a loan with NAV older than the limit reverts |
| R3 | Lenders deposit and withdraw USDT in the pool | P0 | Deposit and withdrawal in official USDT, explorer link in README |
| R4 | Allowlisted buyers post bids: USDT locked, discount, notice period | P0 | Bid with notice below the minimum, or discount above 8%, reverts |
| R5 | Buyers request an exit; USDT unlocks only after notice and only if unreserved | P0 | Early withdrawal reverts; withdrawal after notice succeeds |
| R6 | Borrower opens a loan; limit is the lower of LTV × NAV × q and (1 − h) × free capacity; reservations made cheapest first | P0 | Borrowing above either limit reverts |
| R7 | Repayment returns collateral and releases reservations in one transaction | P0 | One transaction moves USDT to the pool and the asset to the borrower |
| R8 | Default settlement fills reserved bids, repays the pool, returns leftover collateral, in one transaction | P0 | One transaction moves USDT from bids to the pool and the asset to buyers and borrower |
| R9 | Keeper script settles defaulted loans automatically | P0 | A loan past maturity plus grace is settled without a human |
| R10 | Web app: issuer, lender, buyer, borrower views and a capacity readout | P0 | Each party's flow works on testnet from the browser |
| R11 | Commitment fee paid to buyers at repayment, pro rata to reserved USDT and time | P1 | Buyer balances rise by the fee on repayment |
| R12 | NAV-based default before maturity when debt exceeds the liquidation threshold | P1 | NAV drop makes the loan settleable early |
| R13 | Capacity readout: committed, reserved, free and unlocking per asset, from contract views and events | P1 | Page matches contract state |
| R14 | Interest accrues to lenders' pool shares | P1 | Share price rises after a repaid loan |
| R15 | 1inch Aqua: unreserved bids also quote through a SwapVM strategy, so buyers earn between defaults | P2 | Only if contracts are done by Friday 18:00 |
| R16 | Gasless actions for buyers and borrowers through the USDT authorization | P2 | Only if R1–R14 are done |
| R17 | Docs site (Docusaurus) in the app's theme: guides per party, the math, architecture, contracts, API, security, deployments, FAQ | P1 | Site builds and is deployed with a live link |
| R18 | Read API: capacity, bids, loans, events as JSON | P1 | Each endpoint matches contract state |
| R19 | Settings, privacy and terms pages; overview and activity pages | P1 | Pages reachable from the header and the footer |
| R20 | End-to-end tests against the testnet deployment, plus one browser visual pass per page | P0 | Both lifecycles pass; links recorded in plan.md |

## User flows

The demo runs these in order, with one browser profile per party so each wallet is visible.

**Issuer**

1. Deploys the asset and allowlist (in the demo, the deploy script does this).
2. Adds the borrower as a holder, the buyers as buyers, and the market and bid book contracts as allowed contracts.
3. Mints fund shares to the borrower and posts today's NAV.
4. Can pause transfers; a paused asset blocks new loans and settlement until unpaused.

**Lender**

1. Deposits USDT into the pool and receives pool shares.
2. Sees loans outstanding, interest earned and free cash; withdraws what is not lent out.

**Buyer**

1. Locks USDT in a bid: amount, discount (at most 8%), notice period (at least the minimum).
2. Sees how much of the bid is reserved by loans and how much is free.
3. Requests an exit; withdraws free USDT once the notice period ends.
4. On a default, receives fund shares at the bid's price; on repayment, receives the commitment fee (P1).

**Borrower**

1. Picks an amount of shares to pledge; the app shows the price-based limit and the capacity-based limit and uses the lower.
2. Opens the loan: shares go to the market, USDT comes from the pool, capacity is reserved.
3. Repays before maturity plus grace: one transaction pays the pool and returns the shares.

**Keeper**

1. Watches open loans every 15 seconds.
2. Calls settlement on any loan past maturity plus grace, or below the liquidation threshold (P1).
3. Logs each settlement with its transaction link.

## Architecture

Every party acts through the web app, and every rule lives in the contracts: the app and the keeper hold no authority the contracts do not grant to anyone.

Diagram: see [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), section 1 (parties, app, keeper, contracts).

The market reads the NAV, reserves and fills bids in the bid book, and moves USDT and fund shares; the asset checks the allowlist on every transfer. The keeper only calls `settle`, which anyone may call.

## System design

Five small contracts, one keeper script and one web app. Each contract does one job, so a bug in one cannot move another's money. The build kit's `docs/interfaces.md` holds the exact signatures and is the only spec the code is built from.

**Repository layout**

| Path | What lives there | Stack |
| --- | --- | --- |
| `contracts/` | The five contracts, tests, deploy and seed scripts | Foundry, Solidity 0.8.24+, OpenZeppelin 5 |
| `keeper/` | Settlement keeper | Node 22, TypeScript, viem |
| `web/` | One page per party plus the capacity readout | Vite, React, TypeScript, viem |
| `packages/shared/` | ABIs, deployed addresses, constants | TypeScript |
| `docs/` | `plan.md`, `ARCHITECTURE.md`, `interfaces.md`, `ai/` | Markdown |

**Contracts**

| Contract | Job | Key functions |
| --- | --- | --- |
| `AllowlistRegistry` | Who may hold the asset: holder, buyer and contract roles, set by the issuer | `setRoles`, `isAllowed`, `hasRole` |
| `RestrictedAsset` | ERC-20 fund share; every transfer checks both sides against the registry; issuer mints and pauses | `mint`, `pause`, `unpause` |
| `NavOracle` | Issuer-posted NAV in USDT per share, with a timestamp | `setNav`, `latest` |
| `BidBook` | Holds buyers' USDT bids, exits, notice periods and reservations | `postBid`, `requestExit`, `withdraw`, `freeCapacity`, `reserve`, `release`, `fill` |
| `StandbyMarket` | Lending pool and loans: limits, reservations, repayment, default settlement | `deposit`, `withdraw`, `openLoan`, `repay`, `settle`, `isSettleable` |

`reserve`, `release` and `fill` on the bid book can be called only by the market. The market and the bid book hold the contract role on the allowlist, so they can hold fund shares; no other contract can.

**Loan states:** Open → Repaid, or Open → Settled. A loan becomes settleable when the time passes maturity plus grace, or (P1) when debt exceeds the liquidation threshold at the latest NAV.

**Settlement arithmetic:** for each reserved bid, cheapest discount first: price = NAV × (1 − discount); USDT taken = the smaller of the bid's reservation and the debt still due; shares delivered = USDT taken ÷ price, rounded up. Unused reservations are released; leftover shares return to the borrower. Any shortfall is recorded as a pool loss and emitted as an event.

**Events:** `RolesSet`, `NavPosted`, `BidPosted`, `ExitRequested`, `BidWithdrawn`, `Reserved`, `Released`, `Filled`, `Deposited`, `Withdrawn`, `LoanOpened`, `LoanRepaid`, `LoanSettled`, `Shortfall`. The capacity readout and the README's transaction table are built from these.

**Keeper:** polls open loans every 15 seconds, calls `settle` on any that `isSettleable`, logs the transaction link, and never retries a reverted settlement more than three times.

**Web app:** a party switcher (issuer, lender, buyer, borrower) using funded demo wallets; overview, party, capacity, activity, settings, privacy and terms pages. Each party page has a KPI row, an explainer of what the party does and what can go wrong, an action card, and a positions table; every number explains its formula on hover and every action ends with an explorer link. The look takes its patterns from the best lending dashboards (Morpho, Aave) and swap cards (Uniswap) without copying their assets, with one set of light and dark design tokens shared with the docs site.

**Verified constants (5 November 2026)**

| Item | Value |
| --- | --- |
| Chain | Whitechain Sepolia, chain ID 1874, RPC `https://rpc.testnet.whitechain.io`, explorer `https://explorer.testnet.whitechain.io` (Blockscout) |
| Faucet | `https://faucet.testnet.whitechain.io` |
| USDT required by the prize | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`; read `decimals()` at runtime |

## Security and threat model

The product is a promise that a buyer will be there, so the worst failures are a buyer slipping away, capacity counted twice, or the asset landing in a wallet it may not go to.

| Threat | Mitigation | Priority |
| --- | --- | --- |
| Buyer pulls USDT just before a default | Exits only after the notice period; reserved USDT never withdrawable while its loan is open | P0 |
| Buyer raises the discount to make the bid worthless | Discount fixed per bid; changing it means exiting and re-posting; cap of 8% | P0 |
| Same bid counted for two loans | Reservations stored per bid and per loan; free capacity excludes reserved USDT | P0 |
| Bid that unlocks before the loan ends counted as capacity | Free capacity counts a bid in exit only if it unlocks after maturity plus grace | P0 |
| Asset delivered to a wallet off the allowlist | The asset contract checks both sides of every transfer; buyers must hold the buyer role to post a bid | P0 |
| Stale or manipulated NAV | NAV older than the limit blocks new loans; only the issuer may post; P1 adds a maximum change per update | P0, P1 |
| Issuer pauses the asset during a default | Settlement reverts while paused and resumes after; the README states this as a known limit | Known limit |
| Rounding drains USDT over many fills | Shares rounded up for the buyer's price, USDT rounded down; tests with odd decimals | P0 |
| Reentrancy through token hooks | Plain ERC-20s, checks-effects-interactions, `nonReentrant` on every function that moves tokens | P0 |
| Keeper offline | `settle` is callable by anyone; the keeper is a convenience | P0 |

**Not handled in the hackathon build:** real investor verification, securities law for lending against fund shares, redemption with the issuer, an audit. The README must say all four.

## Sponsor fit and qualification checklist

Whitechain's Tokenize track is the one sure pick. Every other sponsor was checked against the rule "drop any sponsor the product does not need": only 1inch has a real job, as a stretch, and Whitechain's Scale track is free to add under the same pick if the gasless actions (R16) get built.

| Sponsor | Decision | Reason |
| --- | --- | --- |
| Whitechain, Tokenize | Enter | Its idea list and its "what we want to see" describe this product |
| Whitechain, Operate | Do not enter | Its own text says financing belongs in Tokenize |
| 1inch Aqua / SwapVM | Stretch (R15) | Unreserved bids could also quote through SwapVM so buyers earn between defaults. Needs Aqua and SwapVM redeployed on Whitechain; decide at Friday 18:00 |
| Hedera tokenization and x402 | Do not enter | A good fit, but on Hedera; building on two chains is out of the question in 30 hours |
| Uniswap | Do not enter | Restricted assets cannot trade on a public pool, and nothing showed Uniswap on Whitechain |
| Arkiv | Do not enter | The capacity readout comes from contract views; a separate database would be decoration |
| 0G, Chainlink, World, ENS, EF, Arc, Definitive | Do not enter | No job in the product |

**Whitechain Tokenize checklist** (from the Mumbai prize page)

- [ ] Contracts deployed on Whitechain Sepolia (chain 1874) and verified on its explorer.
- [ ] At least one payment in USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` in the main flow, with the explorer link in the README. Payments in a self-minted test token do not count.
- [ ] A README line on why this needs onchain stablecoin settlement: "The asset and the USDT move in one transaction only if both live on the same chain; a bank rail cannot deliver a restricted token against payment atomically, and lenders can verify buyers' locked USDT onchain before they lend."
- [ ] Real transfer rules enforced in the contract: allowlist, pause, notice periods, maturity and settlement conditions.
- [ ] A clear issuer, investor and business user, and at least one full lifecycle in the demo: issuance through repayment, and a default through settlement.
- [ ] Public repo with steady commit history; README covering setup, architecture and current limitations.
- [ ] Demo video of 2 to 4 minutes showing each party.
- [ ] `WHITECHAIN_FEEDBACK.md` with honest notes.
- [ ] Avoid the "won't place" list: not a token with a mint button and no rules.

**ETHGlobal rules**

- [ ] Submit on the "Finalist and Partner Prizes" path with Whitechain selected.
- [ ] All code written after kickoff; the README's "Before and during the hackathon" section says the idea comes from Nectar research and no Nectar code was used.
- [ ] AI use documented down to files in `docs/ai/AI_USAGE.md`, with the specs and prompts in `docs/ai/`. ETHGlobal requires this, and projects built entirely by AI can be excluded, so each person reviews and owns the code they merge.
- [ ] Demo video narrated by a real voice, not sped up, not recorded on a phone.

## Build plan

The contracts are the critical path: if they are not deployed and verified by Friday 12:00, cut P1 before anything else. Submissions close at 09:00 IST on Saturday 7 November.

| By (IST) | Milestone | Owner | Done when |
| --- | --- | --- | --- |
| Fri 03:30 | Repo, `docs/plan.md`, `docs/ARCHITECTURE.md`, `docs/interfaces.md` committed; first PR merged | Kunal | `forge build` and `pnpm -r build` pass |
| Fri 05:00 | Deploy and verify spike: a trivial contract verified on the Whitechain explorer; USDT `decimals()` read | Solidity dev | Explorer shows verified source |
| Fri 10:00 | Registry, asset, oracle, bid book, market with tests | Solidity dev | Every P0 requirement has a passing test |
| Fri 12:00 | Deployed, verified, seeded (roles, shares, NAV, bids, pool deposit) | Solidity dev | Seed script prints every explorer link |
| Fri 16:00 | Web app: four party pages on testnet | Swift dev | Each party completes its flow in the browser |
| Fri 16:00 | Keeper settles a defaulted loan | Kunal | Settlement transaction link logged |
| Fri 20:00 | End to end: one repaid loan and one defaulted loan | All | Both lifecycles recorded in `docs/plan.md` |
| Fri 23:00 | P1: commitment fee, NAV-based default, capacity readout, pool share price | Whoever is free | Each done or dropped, never half-done |
| Sat 02:00 | Feature freeze; independent review; README and feedback file | Kunal | Every checkbox in the sponsor section ticked |
| Sat 05:00 | Video recorded and edited | Kunal | 2–4 minutes, narrated, every party shown |
| Sat 08:00 | Submitted | Kunal | Confirmation saved |

**Who does what**

- **Solidity developer:** `contracts/`, deploy and seed scripts, verification. The critical path.
- **Swift developer:** `web/`. His Swift skills have no use in this product; he builds the React pages with the AI assistant doing most of the typing and reviews each PR himself.
- **Kunal:** scaffold, `keeper/`, `packages/shared/`, integration, every PR, `docs/plan.md`, README, feedback file, video, submission.

**Git workflow**

- `main` is always deployable. Every feature gets a branch (`feat/bid-book`, `feat/market-repay`, `feat/web-buyer`) and a pull request with a short description and a test note; merge with a merge commit so the history shows steady progress.
- Commit after each green step, push at least every hour. Messages say what changed: `contracts: reserve bids cheapest first`.
- Commits and pull requests are authored by Kunal, with no co-author trailers and no tool names in messages, descriptions or code comments. The kit's settings turn the assistant's automatic attribution off.
- `docs/plan.md` is updated in the same PR as the feature it describes. It also holds a "Needs Kunal" list: when a step needs a person (a faucet captcha, a login, a rules question), the work leaves a marked placeholder, adds a row there and carries on, so nobody waits.

**If time runs short, cut in this order**

1. R16 gasless actions, then R15 1inch.
2. R14 pool share price: pay interest straight to the pool balance.
3. R12 NAV-based default: keep maturity-based default only.
4. R11 commitment fee: state it as the business model in the README.

Never cut the notice-period lock, the reservation accounting or the allowlist checks: they are the product.

## Demo script and submission

The demo has one job: show a lender lending against an asset nobody can dump, because a buyer is already locked in, and show that buyer actually taking the asset when the loan fails.

| Time | On screen | What judges see |
| --- | --- | --- |
| 0:00 | "Lenders cap tokenized fund shares low because only approved wallets can hold them, so nobody can sell them in a default." | The problem in one line |
| 0:20 | Issuer page: allowlist, NAV posted; a transfer to an outside wallet fails | Transfer rule enforced, explorer link |
| 0:50 | Buyer page: two buyers lock USDT bids at 3% and 5% discounts, 10-minute notice | Committed capacity appears |
| 1:20 | Lender deposits USDT; capacity page shows committed, reserved, free | Pool and capacity |
| 1:40 | Borrower pledges shares; the app shows both limits and borrows the lower | Limit backed by bids |
| 2:10 | A buyer tries to withdraw early and fails | The commitment holds |
| 2:30 | Borrower repays: shares back, pool paid, in one transaction | Full lifecycle |
| 3:00 | A second loan, opened 20 minutes before the slot, is past due; the keeper settles: buyers pay, receive shares, lender is whole | Delivery versus payment in one transaction |
| 3:40 | "The buyer is lined up before the loan is made." | Close |

The loan term plus grace is 17 minutes, longer than the demo slot, so open the second loan before judging and record the default path in advance as a fallback.

**Likely questions**

- *Why would a buyer lock USDT for nothing?* The commitment fee (P1) and a known discount on a default, which is how standby credit works in banking.
- *What if NAV is wrong?* Only the issuer posts it; stale NAV blocks new loans; P1 adds a limit on each change.
- *What stops the buyer leaving?* The notice period, and reserved USDT never unlocks while its loan is open.
- *Who are the first customers?* An issuer of a restricted fund share and a lender that wants to raise its cap on it.
- *Is this Nectar?* The idea comes from our research for Nectar; the code was written here.

**Submission package**

- [ ] Public repo, open licence, README with setup, architecture, contract addresses and explorer links, transaction table for both lifecycles, limitations, and "Before and during the hackathon".
- [ ] `docs/plan.md`, `docs/ARCHITECTURE.md`, `docs/interfaces.md`, `docs/ai/` committed.
- [ ] `WHITECHAIN_FEEDBACK.md`.
- [ ] Video of 2 to 4 minutes, live narration.
- [ ] Team names with Telegram and X handles.

## Risks and open questions

The largest risk is the clock: one Solidity developer carries the critical path, and the team changed direction several times before starting.

**Ask tonight**

- [ ] **ETHGlobal staff:** is a from-scratch entry whose idea comes from the team's own earlier research (Nectar) eligible, with that origin stated in the README?
- [ ] **Whitechain booth:** does a loan against a restricted asset with committed buyers and atomic settlement fit Tokenize, as its repo idea suggests?
- [ ] **Whitechain booth:** what are the test USDT's decimals and faucet limits, and does Blockscout verification work with Foundry on chain 1874?
- [ ] **Solidity developer:** can the five contracts and their tests be done by Friday 10:00?

**Risks**

| Risk | Likelihood | Effect | Response |
| --- | --- | --- | --- |
| Contracts late | Medium | No end-to-end demo | Cut P1 first; the web app can use a mocked contract layer until deploy |
| Judges read it as a deposit escrow, not finance | Low | Tokenize misses | Lead with the issuer, the transfer rules and delivery versus payment |
| Only two Tokenize places | Certain | A small prize ceiling | Accept it; the product, not the prize count, is the reason to build it |
| Whitechain test USDT is scarce | Medium | Too few funded wallets for four parties | Request a larger test allocation from the booth early |
| Eligibility question on the origin | Low | Disqualification | Ask staff; disclose in the README |
| Building it after the hackathon | Open | Whitechain is not in Nectar's chain plan | Decide whether Whitechain becomes a Nectar chain or this stays a prototype for the Builders Program |

## Sources

- The Mumbai prize page Kunal attached: Whitechain Tokenize, Operate and Continuity requirements; 1inch, Uniswap, Hedera and Chainlink track texts.
- Nectar Product Brief (26 October 2026) and Nectar Direction Review (5 November 2026), Kunal's own documents, for the mechanism and the market figures; their sources are listed in them.
- [Whitechain docs index](https://docs.whitechain.io/llms-full.txt), for chain ID, RPC, explorer and faucet.
- [Test USDT implementation, verified source on the Whitechain explorer](https://explorer.testnet.whitechain.io/api/v2/smart-contracts/0x26425662D126412128967ECf0a02EC48573026F7).
- [ETHGlobal rules](https://ethglobal.com/rules).
