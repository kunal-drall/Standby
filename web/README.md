# Standby web app

Vite + React 19 + react-router 7 + viem. Reads the chain directly (no backend) and signs with the
demo party keys through `privateKeyToAccount` + `createWalletClient`; no browser wallet is needed.
Routes follow `docs/interfaces.md` section 7.

```sh
pnpm -C packages/shared build   # once, so @standby/shared/dist exists
pnpm -C web dev                 # http://localhost:5173
pnpm -C web build               # tsc strict, then vite build
```

## Configuration

All variables are optional build-time Vite env (`web/.env.local` or the shell). Every page shows a
"not deployed / not configured" state when addresses are missing, and action cards say which key
is missing for the active party.

| Variable | Default | Meaning |
|---|---|---|
| `VITE_RPC_URL` | shared `RPC_URL` | JSON-RPC endpoint. Settings can override it per browser. |
| `VITE_USDT_ADDRESS` | `deployments.usdt` | Test USDT. `decimals()` is read at runtime. |
| `VITE_REGISTRY_ADDRESS` | `deployments.contracts.AllowlistRegistry` | |
| `VITE_ASSET_ADDRESS` | `deployments.contracts.RestrictedAsset` | |
| `VITE_ORACLE_ADDRESS` | `deployments.contracts.NavOracle` | |
| `VITE_BIDBOOK_ADDRESS` | `deployments.contracts.BidBook` | |
| `VITE_MARKET_ADDRESS` | `deployments.contracts.StandbyMarket` | |
| `VITE_START_BLOCK` | `deployments.startBlock` | First block the Activity page scans (getLogs, 5,000-block chunks). |
| `VITE_DOCS_URL` | GitHub docs folder | Header and footer Docs link. |
| `VITE_KEEPER_API` | unset | Optional keeper read API; only adds a health line on the Overview. |
| `VITE_ISSUER_PK`, `VITE_LENDER_PK`, `VITE_BUYER1_PK`, `VITE_BUYER2_PK`, `VITE_BORROWER_PK` | unset | Testnet throwaway demo keys. They are baked into the bundle, so never use a key that has held real funds. Settings can override each one per browser (localStorage only). |

The chain id is read from the RPC (`eth_chainId`), so a local anvil fork works as is; the network
chip warns when it is not 1874.

## Source map

- `src/config.ts`: every env value in one place.
- `src/state/settings.tsx`: party, theme, number format, RPC URL and key overrides (localStorage).
- `src/state/data.tsx`: network status, the shared snapshot (polled every 5 s and after every
  transaction) and the chain clock for countdowns.
- `src/lib/snapshot.ts`: one batched read of all contract state pinned to a single block.
- `src/lib/logs.ts`: incremental event scan for Activity and the issuer's allowlist table.
- `src/lib/errors.ts`: custom error decoding and the plain-English text for each error.
- `src/components/Tx.tsx`: the write flow (preflight simulation, approvals, send, receipt, panels).
- `src/pages/*`: one file per route.

## Write flow

Every action simulates first, so a revert is shown without sending anything. Before `deposit`,
`postBid` and `repay` the app approves USDT to the right contract, and before `openLoan` it
approves the shares to the market. Each approval is skipped when the allowance already covers it,
and the main call is simulated before approving so a doomed call costs no approval. `repay`
approves `quoteRepay` (dueNow + fees) plus the larger of 0.5% and ten more minutes of interest and
fees, because the amount due grows every second. If the token refuses to change one non-zero
allowance to another, the app resets it to 0 first.

## E2E hooks

- **Party switcher:** a `<select>` labelled **"Acting as"** with options exactly `Issuer`,
  `Lender`, `Buyer 1`, `Buyer 2`, `Borrower`. The choice persists in localStorage. Pages never
  switch the party themselves.
- **Action buttons** (exact names): `Post NAV`, `Pause`, `Unpause`, `Set roles`, `Mint`,
  `Try transfer` (Issuer); `Deposit`, `Withdraw shares` (Lender); `Post bid`, `Request exit`,
  `Withdraw` (Buyer); `Open loan`, `Repay` (Borrower). Also `Settle` (Lender, settleable pool
  loans), `Evict` (Capacity, bids whose buyer lost BUYER), `Claim shares` / `Claim fees`
  (Buyer and Borrower, only when non-zero). No other button name contains one of these.
- `Pause` and `Unpause` are never shown together: the card shows the one that applies to
  `paused()`.
- **Inputs** (by label): `New NAV (USDT per share)`; `Account address` with checkboxes `HOLDER`,
  `BUYER`, `CONTRACT`; `Mint to address`, `Shares to mint`; `Transfer to address`;
  `Deposit amount`, `Shares to withdraw` (plus a `Max` button labelled "Use all my pool shares");
  `Bid amount`, `Discount (%)`, `Notice (seconds)`; `Shares to pledge`, `Borrow amount`.
- **Defaults:** NAV input = current NAV; Mint to = Borrower wallet, 1000 shares; Transfer to =
  `0x000000000000000000000000000000000000dEaD` (not allowlisted, so `Try transfer` shows
  `NotAllowed`); Deposit 100; Bid 500 USDT at 3% (or the max discount if lower) with notice =
  `minNotice`; Shares to pledge = the whole share balance; Borrow amount = `maxBorrow` from
  `previewLimits` until the field is edited.
- **Rows:** bid and loan tables put `Bid #<id>` / `Loan #<id>` in the first cell (a row
  header), newest first. Scope row buttons with
  `page.getByRole('row').filter({ hasText: 'Bid #3' }).getByRole('button', { name: 'Withdraw' })`.
  `Request exit` shows only on bids without an exit; `Withdraw` shows as soon as an exit is
  requested and stays clickable before the notice ends (it then shows `NoticeNotOver`); it
  withdraws the bid's whole unreserved amount. `Repay` shows only on open loans.
- **Success panel:** contains the text `Confirmed` exactly once and one link whose text starts
  with `View on explorer` (the main transaction; approvals are linked as "approval
  transaction"). It appears only after the receipt and a fresh data reload, so assertions that
  follow see the new state. Class `.tx-success`, `role="status"`.
- **Error panel:** contains the decoded custom error name exactly once (for example `NotAllowed`,
  `NoticeNotOver`, `DiscountTooHigh`, `AboveLtv`, `NotIssuer`), then a plain-English explanation.
  Class `.tx-error`, `role="alert"`. Off-chain failures use `InsufficientFunds`, `RpcUnreachable`,
  `NoKey` or `TransactionReverted`.
- **One panel at a time:** starting any action hides the previous result panel on the page, so
  `getByText('Confirmed')` never matches two panels.
- **Cards** are `<section>` regions named by their heading (for example "NAV", "Transfers",
  "Allowlist roles", "Mint shares", "Test a transfer", "Deposit USDT", "Withdraw USDT",
  "Post a standing bid", "My bids", "Borrow against shares", "My loans", "Pool loans"), so
  `page.getByRole('region', { name: 'My bids' })` scopes a card.
- **Tooltips:** every number is focusable and shows its formula in an element with
  `role="tooltip"` on hover or focus.
