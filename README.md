# Standby

Lenders can lend against a restricted tokenized asset because allowlisted buyers have already locked USDT to buy it on default. Built at ETHGlobal Mumbai on Whitechain Sepolia (chain 1874); every payment uses the official test USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`.

**The buyer is lined up before the loan is made.**

## The problem

Lenders accept tokenized fund shares but cap them low. When a loan defaults, nobody has committed to buy collateral that only approved wallets may hold: it cannot be dumped on a DEX, and fund shares redeem on the issuer's schedule, not instantly. Without a known buyer at a known price, the lender's only safe limit is a low one.

## How it works

1. **Issuer** runs an allowlist (holder, buyer and contract roles), mints fund shares to holders, posts the NAV with a timestamp, and can pause transfers. The asset contract checks both sides of every transfer.
2. **Buyers** on the allowlist lock USDT in bids at a fixed discount to NAV (at most 8%) with a notice period (at least 10 minutes). To leave, a buyer requests an exit and waits out the notice. Reserved USDT is never withdrawable.
3. **Lenders** deposit USDT into the pool and receive pool shares whose value grows with interest.
4. **Borrower** pledges shares and borrows at most the lower of:
   - the price limit, `maxLtv × NAV × shares` (85%), and
   - the capacity limit, `(1 − haircut) × free bid capacity` (10% haircut), counting only bids still locked when the loan ends.

   Opening the loan reserves specific bids, cheapest discount first. Each reserved dollar belongs to one loan.
5. **Repayment** is one transaction: principal and interest to the pool, a commitment fee to the reserved buyers, reservations released, shares back to the borrower.
6. **Default** (past maturity plus grace, or debt above 90% of collateral value at a fresh NAV) is settled in one transaction by anyone, normally the keeper: each reserved bid pays USDT to the pool and receives shares at its own price, delivery versus payment; leftover shares return to the borrower; any shortfall is emitted and borne by the pool.

Demo parameters: 85% max LTV, 90% liquidation threshold, 10% haircut, 8% a year simple interest, 2% a year commitment fee, 15-minute term, 2-minute grace, 1-day NAV staleness limit. Production values would be days, not minutes.

**Why on-chain stablecoin settlement:** the asset and the USDT move in one transaction only if both live on the same chain; a bank rail cannot deliver a restricted token against payment atomically, and lenders can verify buyers' locked USDT on-chain before they lend.

Design and diagrams: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Exact interfaces: [`docs/interfaces.md`](docs/interfaces.md). Requirements: [`docs/ai/PRD.md`](docs/ai/PRD.md). Live status: [`docs/plan.md`](docs/plan.md).

## Repository layout

| Path | What | Stack |
|---|---|---|
| `contracts/` | AllowlistRegistry, RestrictedAsset, NavOracle, BidBook, StandbyMarket; tests; deploy and seed scripts | Foundry, Solidity ^0.8.24 (solc 0.8.28), OpenZeppelin 5.6.1 |
| `keeper/` | Settlement keeper and read API (`/api/health`, `/capacity`, `/bids`, `/loans`, `/events`) | Node 22, TypeScript, viem, Hono, zod |
| `web/` | Overview, issuer, lender, buyer, borrower, capacity, activity, settings, privacy, terms; Playwright E2E in `web/e2e` | Vite, React 19, TypeScript, viem |
| `site/` | Docs site: guides, the math, architecture, contracts, read API, security, deployments, FAQ | Docusaurus 3, Mermaid |
| `packages/shared/` | Chain constants, units and math helpers, ABIs, deployed addresses, design tokens | TypeScript |
| `scripts/` | Wallets, local fork rehearsal, testnet deploy, ABI export | bash, Node |
| `docs/` | Plan, architecture, interfaces, PRD, AI prompts and usage, submission | Markdown |

## Setup

Requires Node 22, pnpm 10 and Foundry.

```bash
git clone --recurse-submodules https://github.com/kunal-drall/Standby.git
cd Standby
pnpm install
cd contracts && forge build && forge test && cd ..
pnpm -r build
pnpm -r test
```

### Rehearse locally (no faucet needed)

`./scripts/local-chain.sh` forks Whitechain Sepolia with anvil (chain 1874, so the official test USDT contract is present), gives anvil's public dev wallets test USDT, deploys and seeds the demo, and writes `.local/env` and `web/.env.local`. Then:

```bash
set -a && . .local/env && set +a && POLL_INTERVAL_MS=2000 pnpm -C keeper start   # keeper + read API on :8788
pnpm -C web dev                                                                   # app on :5173
pnpm -C web exec playwright test                                                  # E2E, both lifecycles
```

### Deploy to Whitechain Sepolia

```bash
cp .env.example .env
./scripts/new-wallets.sh          # six fresh keys into .env; prints addresses only
# fund each address with WBT (https://faucet.testnet.whitechain.io) and the lender, buyers and borrower with test USDT
./scripts/deploy-testnet.sh       # preflight balances, deploy, verify on Blockscout, seed, export ABIs
```

The script writes the addresses to `packages/shared/src/deployments.json` and `.env`. Build the web app with the `VITE_*` values from `web/README.md`, run the keeper with `pnpm -C keeper start`, and deploy `web/` and `site/` as static sites.

## Deployments (Whitechain Sepolia, chain 1874)

| Contract | Address |
|---|---|
| AllowlistRegistry | TODO(kunal): after `scripts/deploy-testnet.sh` |
| RestrictedAsset | TODO(kunal) |
| NavOracle | TODO(kunal) |
| BidBook | TODO(kunal) |
| StandbyMarket | TODO(kunal) |
| Test USDT (official) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |

## Transactions (both lifecycles)

| Step | Transaction |
|---|---|
| Issuer posts NAV | TODO(kunal) |
| Transfer to a non-allowlisted wallet fails | TODO(kunal) |
| Buyer 1 bids 600 USDT at 3%, buyer 2 bids 500 USDT at 5% | TODO(kunal) |
| Lender deposits USDT | TODO(kunal) |
| Borrower opens loan 1 (USDT out of the pool) | TODO(kunal) |
| Early buyer withdrawal reverts (NoticeNotOver) | TODO(kunal) |
| Borrower repays loan 1 (USDT to pool, shares back) | TODO(kunal) |
| Borrower opens loan 2 | TODO(kunal) |
| Keeper settles loan 2 (buyers' USDT to pool, shares to buyers) | TODO(kunal) |

The same flows run end to end against the local fork in `web/e2e` (see `docs/plan.md`, Demo runs).

## Security and known limits

- Rules enforced in the contracts: allowlist on every asset transfer, issuer pause, NAV staleness limit for new loans, minimum notice and maximum discount for bids, reserved USDT never withdrawable, a bid in exit counts only for loans ending before it unlocks, settlement only past maturity plus grace or below the threshold at fresh NAV, `nonReentrant` and checks-effects-interactions on every token-moving function, no upgradeability, no admin keys in the market.
- Known limits: testnet only; no real investor verification; no redemption with the issuer; NAV is trusted from the issuer; an issuer pause blocks repayment and settlement until unpaused; if the issuer removes the borrower from the allowlist, returning their collateral reverts until restored; no audit. Securities law for lending against fund shares is out of scope.
- The demo web app signs with testnet throwaway keys supplied at build time or pasted into Settings. Never use a key that has held real funds.

## Before and during the hackathon

- **Before:** the idea comes from our own earlier research for Nectar (Lemma Labs), a design for lending against assets backed by committed buyers. We wrote the product requirements and the interface spec in `docs/` before kickoff.
- **During:** all code in this repository was written at the event. No Nectar code, designs or assets are used.
- AI use is documented file by file in [`docs/ai/AI_USAGE.md`](docs/ai/AI_USAGE.md); the prompts are in [`docs/ai/prompts.md`](docs/ai/prompts.md).

## Feedback

Notes on building on Whitechain: [`WHITECHAIN_FEEDBACK.md`](WHITECHAIN_FEEDBACK.md).

## Licence

MIT, see [`LICENSE`](LICENSE).
