# AI usage

ETHGlobal asks teams to document where and how AI was used, down to files. We used an AI coding assistant for drafting code, tests and docs from the specs in `docs/`; every change was reviewed and merged by a team member through a pull request. One row per pull request.

| Date (IST) | PR | Files drafted with AI | What the human did |
|---|---|---|---|
| 2026-11-06 | planning | docs/interfaces.md, docs/plan.md, docs/ARCHITECTURE.md, docs/ai/prompts.md | Chose the product, reviewed and edited the specs |
| 2026-11-06 | scaffold | package.json, pnpm-workspace.yaml, tsconfig.base.json, .env.example, .github/, packages/shared/src/*, keeper/src/*, web/src/*, web configs, contracts/foundry.toml, contracts/src/*.sol (placeholders), contracts/test/Scaffold.t.sol, site/README.md, README.md, LICENSE; docs/ai/PRD.md exported from the requirements document | Review and merge pending (Kunal) |
| 2026-11-06 | contracts | contracts/src/*.sol, contracts/test/*.t.sol, contracts/script/*.s.sol, scripts/export-abi.mjs, packages/shared/src/abi.ts (generated) | Review and merge pending (Kunal) |
| 2026-11-06 | keeper | keeper/src/*.ts, keeper/test/*.ts, keeper/vitest.config.ts | Review and merge pending (Kunal) |
| 2026-11-06 | web | web/src/** (pages, components, lib, state), web/README.md, web/e2e/*.ts, web/playwright.config.ts | Review and merge pending (Kunal) |
| 2026-11-06 | docs site | site/docusaurus.config.ts, site/sidebars.ts, site/docs/**, site/src/** | Review and merge pending (Kunal) |
| 2026-11-06 | review | Independent review of contracts/src and keeper/src (10 findings); the fixes in contracts/src, contracts/test and keeper/src | Review and merge pending (Kunal) |
| 2026-11-06 | scripts and docs | scripts/local-chain.sh, scripts/deploy-testnet.sh, scripts/e2e-local.sh, packages/shared/styles/tokens.css, docs/interfaces.md (v1.1, v1.2), docs/plan.md, docs/ARCHITECTURE.md, README.md, WHITECHAIN_FEEDBACK.md, docs/SUBMISSION.md | Review and merge pending (Kunal) |
