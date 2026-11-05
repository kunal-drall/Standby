# Standby architecture

How the parts fit, how money moves, and which rules each contract enforces. Diagrams are Mermaid and render on GitHub and in the docs site. Exact signatures live in `docs/interfaces.md`.

## 1. Components

```mermaid
flowchart TB
  subgraph Parties
    I[Issuer]:::p
    L[Lender]:::p
    B[Buyer]:::p
    R[Borrower]:::p
  end
  W[Web app<br/>one page per party, capacity, activity, settings]
  K[Keeper + read API<br/>settles past-due loans, serves /api]
  subgraph WC[Whitechain Sepolia]
    REG[AllowlistRegistry<br/>holder, buyer, contract roles]
    AST[RestrictedAsset<br/>checks both sides of every transfer]
    NAV[NavOracle<br/>issuer-posted NAV]
    BB[BidBook<br/>locked bids, notice, reservations]
    MKT[StandbyMarket<br/>pool, loans, repay, settle]
    USDT[(Test USDT)]
  end
  I & L & B & R --> W
  W -->|signed transactions| WC
  K -->|settle| MKT
  K -->|reads| WC
  AST --> REG
  MKT --> NAV
  MKT -->|reserve, release, fill| BB
  MKT --> AST
  BB --> USDT
  MKT --> USDT
  classDef p fill:none
```

## 2. Opening a loan

```mermaid
sequenceDiagram
  participant Bo as Borrower
  participant M as StandbyMarket
  participant O as NavOracle
  participant BB as BidBook
  participant A as RestrictedAsset
  participant U as USDT
  Bo->>M: openLoan(collateral, principal)
  M->>O: latest()
  M->>M: check NAV fresh, principal <= priceLimit
  M->>BB: reserve(maturity + grace, needed)
  BB-->>M: bidIds, amounts (cheapest discount first)
  M->>A: transferFrom(borrower, market, collateral)
  M->>U: transfer(borrower, principal)
  M-->>Bo: LoanOpened
```

## 3. Repayment (one transaction)

```mermaid
sequenceDiagram
  participant Bo as Borrower
  participant M as StandbyMarket
  participant BB as BidBook
  participant A as RestrictedAsset
  participant U as USDT
  Bo->>M: repay(loanId)
  M->>U: transferFrom(borrower, market, due + fees)
  M->>U: fees to buyers (P1)
  M->>BB: release(each reservation)
  M->>A: transfer(borrower, collateral)
```

## 4. Default settlement (one transaction, delivery versus payment)

```mermaid
sequenceDiagram
  participant K as Keeper or anyone
  participant M as StandbyMarket
  participant BB as BidBook
  participant A as RestrictedAsset
  K->>M: settle(loanId)
  loop each reserved bid, cheapest first
    M->>BB: fill(bidId, take, market)
    Note over BB,M: buyer's locked USDT repays the pool
    M->>A: transfer(buyer, take / price)
    Note over A: reverts unless buyer is allowlisted
    M->>BB: release(unused part)
  end
  M->>A: transfer(borrower, leftover collateral)
```

## 5. State machines

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Open: postBid
  Open --> Exiting: requestExit
  Exiting --> Withdrawable: now >= exitAt
  Withdrawable --> Closed: withdraw all unreserved
  note right of Exiting: counts as capacity only for loans ending before exitAt
```

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Open: openLoan
  Open --> Repaid: repay
  Open --> Settled: settle (past maturity + grace, or P1 below threshold)
```

## 6. The limit

`maxBorrow = min(maxLtv × NAV × collateral, (1 − haircut) × freeCapacity(maturity + grace))`, solved for principal including interest to the end of grace. Each reserved dollar belongs to one loan. A bid in exit counts only for loans that end before it unlocks.

## 7. Trust and authority

| Actor | Can | Cannot |
|---|---|---|
| Issuer | Set roles, mint to holders, pause, post NAV | Move anyone's tokens or USDT, change market parameters |
| Market | Reserve, release and fill bids; hold collateral | Withdraw a buyer's unreserved USDT; send shares off the allowlist |
| Buyer | Post, exit after notice, withdraw unreserved USDT | Change a bid's discount; withdraw reserved USDT |
| Keeper | Call `settle` | Anything else (anyone can call `settle`) |
| Deployer | Set the bid book's market once | Anything after that |

Shares owed to an account that is off the allowlist at repayment or settlement are held by the market as a claim (`claimShares`), so the issuer's allowlist changes can never block a loan from closing.

Known limits: an issuer pause blocks repayment and settlement until unpaused; NAV is trusted from the issuer and settlement waits for a fresh one; a lender can exit before a pending shortfall is realised; no audit.

## 8. Off-chain parts

- **Keeper** (`keeper/`): polls open loans every 15 s, settles any `isSettleable`, retries at most three times. Also serves the read API (`docs/interfaces.md` section 6).
- **Web app** (`web/`): Vite + React + viem; design tokens shared with the docs site; party switcher with demo testnet wallets; every action ends with an explorer link.
- **Docs site** (`site/`): Docusaurus with Mermaid, same tokens.

## 9. Deployment

Foundry script deploys the five contracts, wires roles, verifies on Blockscout, writes addresses to `packages/shared/src/deployments.json`, and seeds the demo (shares, NAV, bids, pool deposit). Web app and docs site deploy as static sites.
