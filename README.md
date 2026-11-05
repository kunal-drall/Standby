# Standby

Lenders can lend against a restricted tokenized asset because allowlisted buyers have already locked USDT to buy it on default. Built for ETHGlobal Mumbai on Whitechain Sepolia (chain 1874); every payment uses the official test USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`.

> Status: scaffold. Contracts, keeper and web app are being built; see [`docs/plan.md`](docs/plan.md) for live status, deployed addresses and demo transactions.

## How it works

- An issuer runs an allowlist for a tokenized T-bill fund share and posts its NAV.
- Allowlisted buyers lock USDT in bids at a fixed discount to NAV, with a notice period before they can leave.
- A borrower pledges shares and borrows the lower of a price-based limit and the free bid capacity after a haircut. Opening the loan reserves specific bids.
- Repayment returns the shares in one transaction. On default, the reserved bids pay the pool and receive the shares at their own price, also in one transaction.

Design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Exact interfaces: [`docs/interfaces.md`](docs/interfaces.md). Requirements: [`docs/ai/PRD.md`](docs/ai/PRD.md).

## Repository layout

| Path | What | Stack |
|---|---|---|
| `contracts/` | The five contracts, tests, deploy and seed scripts | Foundry, Solidity ^0.8.24, OpenZeppelin 5.6.1 |
| `keeper/` | Settlement keeper and read API | Node 22, TypeScript, viem, Hono |
| `web/` | One page per party, capacity, activity, settings | Vite, React, TypeScript, viem |
| `site/` | Docs site (placeholder) | Docusaurus 3 |
| `packages/shared/` | Chain constants, units, ABIs, deployed addresses | TypeScript |
| `docs/` | Plan, architecture, interfaces, AI prompts and usage | Markdown |

## Setup

Requires Node 22, pnpm 10 and Foundry.

```bash
git clone --recurse-submodules https://github.com/kunal-drall/Standby.git
cd Standby
pnpm install
pnpm -r build
pnpm -r test
cd contracts && forge build && forge test
```

Testnet wallets: `cp .env.example .env`, then `./scripts/new-wallets.sh` writes six fresh keys to `.env` and prints only the addresses. Fund them with WBT from the [faucet](https://faucet.testnet.whitechain.io) and with test USDT.

Run the keeper's read API: `pnpm -C keeper start` (port 8788, `GET /api/health`). Run the web app: `pnpm -C web dev`.

## Before and during the hackathon

- **Before:** the idea comes from our own earlier research for Nectar (Lemma Labs), a design for lending against assets backed by committed buyers. We wrote the product requirements and the interface spec in `docs/` before kickoff.
- **During:** all code in this repository was written at the event. No Nectar code, designs or assets are used.
- AI use is documented file by file in [`docs/ai/AI_USAGE.md`](docs/ai/AI_USAGE.md); the prompts are in [`docs/ai/prompts.md`](docs/ai/prompts.md).

## Known limits

Testnet only. No real investor verification, no redemption with the issuer, no audit. NAV is trusted from the issuer, and an issuer pause blocks settlement until unpaused.

## Licence

MIT, see [`LICENSE`](LICENSE).
