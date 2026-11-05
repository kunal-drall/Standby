# Standby interfaces v1.2 (frozen)

The only spec the code is built from. Change it only by team agreement: bump the version line, note it in `docs/plan.md` (Decision log), and tell every session to restart its context.

v1.1 (2026-11-06): closes the gaps found while scaffolding. `BidBook.reserve` takes the `loanId` its `Reserved` event already carried; read-only views added for the UI and keeper; custom errors named; settlement skips a buyer the issuer has since removed from the allowlist. All additions are listed in section 5a.

v1.2 (2026-11-06): fixes from the independent review. Shares owed to an account that is off the allowlist are held as a claim instead of blocking settlement or repayment, a revoked buyer's reservation is still filled, settlement needs a fresh NAV, the bid book limits open bids per buyer and notice length and lets anyone evict a revoked buyer's unreserved USDT, and a commitment fee the token refuses to deliver is held as a claim. See section 5a.

## 1. Constants (verified 5 Nov 2026)

| Name | Value |
|---|---|
| Chain | Whitechain Sepolia, chain ID `1874` |
| RPC | `https://rpc.testnet.whitechain.io` (Ankr free RPC also offered to hackers) |
| Explorer (Blockscout) | `https://explorer.testnet.whitechain.io`, verifier API `https://explorer.testnet.whitechain.io/api/` |
| Faucet | `https://faucet.testnet.whitechain.io` (WBT for gas) |
| USDT (required) | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`. Read `decimals()` at runtime; never assume 6. Self-minted stablecoins do not count for the prize |

## 2. Env vars (`.env`, never committed)

```
WC_RPC_URL=https://rpc.testnet.whitechain.io
WC_CHAIN_ID=1874
USDT_ADDRESS=0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7
DEPLOYER_PK=        # deploys and acts as ISSUER in the demo
LENDER_PK=
BUYER1_PK=
BUYER2_PK=
BORROWER_PK=
KEEPER_PK=
# filled by the deploy script:
REGISTRY_ADDRESS=
ASSET_ADDRESS=
ORACLE_ADDRESS=
BIDBOOK_ADDRESS=
MARKET_ADDRESS=
```
The web app reads `VITE_*` copies of the addresses and, for the demo only, the five testnet party keys. Testnet throwaway keys only; never a key that has held real funds.

## 3. Units

- USDT amounts: token base units (`uint256`), decimals read at runtime.
- Asset shares: 18 decimals.
- NAV: USDT base units per `1e18` share units. Example: NAV 1.02 USDT with 6 decimals = `1_020_000`.
- Basis points: `uint16`, 10_000 = 100%.
- Time: `uint40` seconds.

## 4. Market parameters (constructor, immutable)

| Name | Demo value | Meaning |
|---|---|---|
| `maxLtvBps` | 8500 | price-based limit |
| `liqThresholdBps` | 9000 | P1: settleable early above this debt/collateral ratio |
| `haircutBps` | 1000 | capacity haircut h |
| `maxDiscountBps` | 800 | highest bid discount accepted (bid book) |
| `minNotice` | 600 | seconds (bid book) |
| `loanTerm` | 900 | seconds from open to maturity |
| `grace` | 120 | seconds after maturity |
| `rateBps` | 800 | interest per year, simple |
| `commitFeeBps` | 200 | P1: per year on reserved USDT, paid to buyers at repayment |
| `maxNavAge` | 86400 | seconds; older NAV blocks new loans |

## 5. Contracts (Solidity ^0.8.24, OpenZeppelin 5, custom errors, no upgradeability, no admin withdraw)

### AllowlistRegistry
```solidity
uint8 constant HOLDER = 1; uint8 constant BUYER = 2; uint8 constant CONTRACT = 4; // bitmask
constructor(address issuer);
function setRoles(address account, uint8 roles) external;          // onlyIssuer
function hasRole(address account, uint8 role) external view returns (bool);
function isAllowed(address account) external view returns (bool); // any role
event RolesSet(address indexed account, uint8 roles);
```

### RestrictedAsset (ERC-20, 18 decimals)
```solidity
constructor(string name, string symbol, address registry, address issuer);
function mint(address to, uint256 amount) external;   // onlyIssuer; `to` must have HOLDER
function pause() external; function unpause() external; // onlyIssuer
// _update override: revert Paused() when paused; for transfers (not mint/burn) revert NotAllowed()
// unless registry.isAllowed(from) && registry.isAllowed(to)
```

### NavOracle
```solidity
constructor(address issuer);
function setNav(uint256 nav) external;                    // onlyIssuer; nav > 0
function latest() external view returns (uint256 nav, uint40 updatedAt);
event NavPosted(uint256 nav, uint40 at);
```

### BidBook
```solidity
struct Bid { address buyer; uint256 amount; uint256 reserved; uint16 discountBps; uint40 notice; uint40 exitAt; bool closed; }
constructor(address usdt, address registry, uint16 maxDiscountBps, uint40 minNotice);
function setMarket(address market) external;              // once, by deployer
function postBid(uint256 amount, uint16 discountBps, uint40 notice) external returns (uint256 bidId); // caller has BUYER; pulls USDT
function requestExit(uint256 bidId) external;              // bid owner; sets exitAt = now + notice
function withdraw(uint256 bidId, uint256 amount) external; // owner; requires exitAt != 0 && now >= exitAt && amount <= amount - reserved
function freeCapacity(uint40 until) external view returns (uint256); // sum of (amount - reserved) over open bids with exitAt == 0 || exitAt > until
function reserve(uint256 loanId, uint40 until, uint256 needed) external returns (uint256[] memory bidIds, uint256[] memory amounts); // onlyMarket; cheapest discount first; reverts InsufficientCapacity
function release(uint256 bidId, uint256 amount) external;  // onlyMarket
function fill(uint256 bidId, uint256 usdtAmount, address to) external; // onlyMarket; reserved -= usdtAmount; amount -= usdtAmount; USDT to `to`
function getBid(uint256 bidId) external view returns (Bid memory);
function bidCount() external view returns (uint256);
event BidPosted(uint256 indexed bidId, address indexed buyer, uint256 amount, uint16 discountBps, uint40 notice);
event ExitRequested(uint256 indexed bidId, uint40 exitAt);
event BidWithdrawn(uint256 indexed bidId, uint256 amount);
event Reserved(uint256 indexed bidId, uint256 indexed loanId, uint256 amount);
event Released(uint256 indexed bidId, uint256 amount);
event Filled(uint256 indexed bidId, uint256 usdtAmount);
```
Rules: `discountBps <= maxDiscountBps` else `DiscountTooHigh`; `notice >= minNotice` else `NoticeTooShort`; max 32 open bids (`TooManyBids`); reserved USDT is never withdrawable.

### StandbyMarket (lending pool + loans)
```solidity
enum LoanState { None, Open, Repaid, Settled }
struct Loan { address borrower; uint256 collateral; uint256 principal; uint40 openedAt; uint40 maturity; LoanState state; }
struct Params { uint16 maxLtvBps; uint16 liqThresholdBps; uint16 haircutBps; uint16 rateBps; uint16 commitFeeBps; uint40 loanTerm; uint40 grace; uint40 maxNavAge; }
constructor(address usdt, address asset, address oracle, address bidBook, Params p);
// pool
function deposit(uint256 assets) external returns (uint256 shares);
function withdraw(uint256 shares) external returns (uint256 assets); // reverts InsufficientCash if not enough idle USDT
function totalAssets() external view returns (uint256);              // idle USDT + outstanding principal + accrued interest
// loans
function previewLimits(uint256 collateral) external view returns (uint256 priceLimit, uint256 capacityLimit, uint256 maxBorrow);
function openLoan(uint256 collateral, uint256 principal) external returns (uint256 loanId);
function due(uint256 loanId) external view returns (uint256);        // principal + simple interest to now
function repay(uint256 loanId) external;                              // borrower; pays due (+ commitment fee P1)
function isSettleable(uint256 loanId) external view returns (bool);
function settle(uint256 loanId) external;                             // anyone
function getLoan(uint256 loanId) external view returns (Loan memory, uint256[] memory bidIds, uint256[] memory reserved);
event Deposited(address indexed lender, uint256 assets, uint256 shares);
event Withdrawn(address indexed lender, uint256 assets, uint256 shares);
event LoanOpened(uint256 indexed loanId, address indexed borrower, uint256 collateral, uint256 principal, uint40 maturity);
event LoanRepaid(uint256 indexed loanId, uint256 paid, uint256 commitmentFees);
event LoanSettled(uint256 indexed loanId, uint256 recovered, uint256 collateralToBuyers, uint256 collateralReturned);
event Shortfall(uint256 indexed loanId, uint256 amount);
```

Math:
- `value = collateral * nav / 1e18`; `priceLimit = value * maxLtvBps / 1e4`.
- `dueAt(t) = principal + principal * rateBps * (t - openedAt) / (1e4 * 365 days)`.
- `needed = ceil(dueAt(maturity + grace) * 1e4 / (1e4 - haircutBps))`; `openLoan` calls `bidBook.reserve(maturity + grace, needed)`.
- `capacityLimit` = the largest principal whose `needed` fits `freeCapacity(maturity + grace)`, with `maturity = now + loanTerm`.
- `openLoan` requires: NAV fresh (`StaleNav`), asset not paused, `principal <= priceLimit` (`AboveLtv`), capacity reserved, idle USDT >= principal (`InsufficientCash`).
- `isSettleable`: state Open and (`now > maturity + grace` or, P1, `dueAt(now) * 1e4 > value * liqThresholdBps`).
- `settle`: `remaining = dueAt(now)`; for each reservation in stored order: `price = nav * (1e4 - discount) / 1e4`; `take = min(reserved_i, remaining)`; `shares = ceil(take * 1e18 / price)`, capped at collateral left (then `take = shares * price / 1e18`); `bidBook.fill(id, take, market)`; asset `transfer(buyer, shares)`; `release` the unused part; after the loop emit `Shortfall` if `remaining > 0`; return leftover collateral to the borrower.
- `repay`: pull `dueAt(now)` (+ P1 fees: `sum(reserved_i) * commitFeeBps * elapsed / (1e4 * 365 days)`, paid to each bid's buyer pro rata) from the borrower; release all reservations; return collateral.
- Every token-moving function is `nonReentrant` and follows checks-effects-interactions.

The deploy script grants `CONTRACT` to the market and the bid book, `HOLDER` to the borrower, `BUYER` to both buyers.

## 5a. v1.1 additions

Ids: bid ids and loan ids start at 0 and count up (`bidCount()`, `loanCount()`).

```solidity
// AllowlistRegistry
function issuer() external view returns (address);
function roles(address account) external view returns (uint8);
error NotIssuer();

// RestrictedAsset
function paused() external view returns (bool);
function registry() external view returns (address);
function issuer() external view returns (address);
event PauseSet(bool paused);
error Paused(); error NotAllowed(); error NotIssuer(); error NotHolder();

// NavOracle
function issuer() external view returns (address);
error NotIssuer(); error ZeroNav();

// BidBook
function market() external view returns (address);
function usdt() external view returns (address);
function registry() external view returns (address);
function maxDiscountBps() external view returns (uint16);
function minNotice() external view returns (uint40);
function openBidIds() external view returns (uint256[] memory); // open bids, cheapest discount first, ties by id
event MarketSet(address market);
error NotBuyer(); error NotBidOwner(); error NotMarket(); error NotDeployer(); error MarketAlreadySet();
error ZeroAmount(); error BidClosed(); error ExitAlreadyRequested(); error ExitNotRequested();
error NoticeNotOver(); error ExceedsUnreserved(); error ExceedsReserved();
error DiscountTooHigh(); error NoticeTooShort(); error TooManyBids(); error InsufficientCapacity();

// StandbyMarket
function usdt() external view returns (address);
function asset() external view returns (address);
function oracle() external view returns (address);
function bidBook() external view returns (address);
function params() external view returns (Params memory);
function loanCount() external view returns (uint256);
function sharesOf(address lender) external view returns (uint256);
function totalShares() external view returns (uint256);
function cash() external view returns (uint256);                      // idle USDT the pool can lend or pay out
function totalPrincipal() external view returns (uint256);            // outstanding principal of open loans
function convertToAssets(uint256 shares) external view returns (uint256);
function quoteRepay(uint256 loanId) external view returns (uint256 dueNow, uint256 fees); // repay pulls dueNow + fees
error ZeroAmount(); error ZeroShares(); error AssetPaused(); error LoanNotOpen(); error NotBorrower(); error NotSettleable();
error StaleNav(); error AboveLtv(); error InsufficientCash();

// v1.2: claims (StandbyMarket)
function claimableShares(address account) external view returns (uint256);
function claimableFees(address buyer) external view returns (uint256);
function claimShares() external;   // reverts NotAllowed (asset) while the caller is off the allowlist
function claimFees() external;
event SharesHeld(address indexed account, uint256 shares);
event SharesClaimed(address indexed account, uint256 shares);
event FeeHeld(address indexed buyer, uint256 amount);
event FeesClaimed(address indexed buyer, uint256 amount);

// v1.2: BidBook limits and eviction
uint256 constant MAX_BIDS_PER_BUYER = 4; uint40 constant MAX_NOTICE = 30 days;
function openBidsOf(address buyer) external view returns (uint256);
function evict(uint256 bidId) external; // anyone; buyer lacks BUYER; refunds the unreserved part to the buyer
event Evicted(uint256 indexed bidId, uint256 refunded);
error NoticeTooLong(); error StillBuyer();
```

Rules added in v1.1:
- A bid closes when its `amount` reaches 0 (fully withdrawn or filled); a closed bid leaves `openBidIds`.
- Pool shares: `shares = assets * (totalShares + 1) / (totalAssets + 1)` on deposit, `assets = shares * (totalAssets + 1) / (totalShares + 1)` on withdraw, both rounded down. `cash` is tracked internally, so a direct USDT transfer to the market does not change the share price.
- `totalAssets` accrues interest over all open loans from aggregate sums (`totalPrincipal` and the principal-weighted open time), so it can differ from the sum of `due` by a few base units of rounding.
- `isSettleable` requires a fresh NAV for both triggers (v1.2): fills are priced from NAV, so a stale NAV waits for the issuer's next post instead of forcing buyers to pay an old price. `repay` and `settle` revert `AssetPaused` while the asset is paused.
- `settle` fills every reservation (v1.2). Shares for a buyer, and leftover collateral for a borrower, who is off the allowlist at that moment are held in the market as `claimableShares` and collected with `claimShares` once allowed again, so an allowlist change can never block settlement or repayment and shares never reach a non-allowlisted wallet. New loans count only bids whose buyer holds BUYER.
- A commitment fee whose USDT transfer to the buyer fails is held as `claimableFees` (v1.2), so one buyer cannot block repayment.
- Bid book (v1.2): at most 4 open bids per buyer and 32 in total; notice at most 30 days; `evict` frees a revoked buyer's slot.
- `repay` may be called by the borrower at any time while the loan is open, including after maturity plus grace, until someone settles it.

## 6. Read API (P1, served by the keeper process, Hono, JSON)

| Method path | Response |
|---|---|
| `GET /api/health` | `{ok, block, navAgeSeconds}` |
| `GET /api/capacity` | `{decimals, committed, reserved, free, freeUntil, unlocking: [{bidId, amount, unlocksAt}], navs: {nav, updatedAt}}` |
| `GET /api/bids` | `{decimals, bids: [{bidId, buyer, amount, reserved, discountBps, notice, exitAt, closed}]}` |
| `GET /api/loans` | `{decimals, loans: [{loanId, borrower, collateral, principal, due, maturity, state, settleable}]}` |
| `GET /api/events?fromBlock=` | `{decimals, fromBlock, toBlock, events: [{contract, event, args, blockNumber, logIndex, txHash, explorerUrl}]}` |

All amounts as decimal strings in base units, with `decimals` (USDT) at the top level; list endpoints wrap the list in an object for that reason (v1.1). `free` is `freeCapacity(freeUntil)` with `freeUntil = now + loanTerm + grace`, the capacity a loan opened now can use; `unlocking` lists bids in exit with their unreserved amount. `/api/events` scans at most 50,000 blocks from `fromBlock` (default: the deployment's start block); page with `toBlock + 1`. Errors: `{ok: false, error}` with 503 when the chain cannot be read or nothing is deployed, 400 for a bad `fromBlock`.

## 7. Web app routes

`/` overview, `/issuer`, `/lender`, `/buyer`, `/borrower`, `/capacity`, `/activity`, `/settings`, `/privacy`, `/terms`, link to the docs site. Party switcher in the header. Every action shows the transaction link after it lands.
