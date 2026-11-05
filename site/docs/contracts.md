---
id: contracts
title: Contracts reference
---

# Contracts reference

Solidity ^0.8.24, OpenZeppelin 5, custom errors, no upgradeability, no admin withdraw. Signatures are from `docs/interfaces.md` v1.1 and the sources in `contracts/src/`.

There are five contracts. Addresses are on the [Deployments](./deployments.mdx) page.

Ids: bid ids and loan ids start at 0 and count up (`bidCount()`, `loanCount()`).

## AllowlistRegistry

Decides who may hold the restricted asset. Roles are a bitmask: `HOLDER` = 1, `BUYER` = 2, `CONTRACT` = 4. Any role makes an account allowed.

```solidity
constructor(address issuer);
function setRoles(address account, uint8 roles) external;
function hasRole(address account, uint8 role) external view returns (bool);
function isAllowed(address account) external view returns (bool);
function issuer() external view returns (address);
function roles(address account) external view returns (uint8);
```

| Function | Who may call |
| --- | --- |
| `setRoles` | Issuer only. Replaces the account's roles; 0 removes it from the allowlist |
| `hasRole`, `isAllowed`, `issuer`, `roles` | Anyone (view) |

**Event:** `RolesSet(address indexed account, uint8 roles)`

**Errors:** `NotIssuer`, `ZeroAddress`, `InvalidRoles`

## RestrictedAsset

ERC-20 fund share with 18 decimals. Every balance change reverts while paused. For transfers (not mints or burns), both sides must be allowed by the registry.

```solidity
constructor(string name, string symbol, address registry, address issuer);
function mint(address to, uint256 amount) external;
function pause() external;
function unpause() external;
function paused() external view returns (bool);
function registry() external view returns (address);
function issuer() external view returns (address);
```

| Function | Who may call |
| --- | --- |
| `mint` | Issuer only. `to` must hold `HOLDER` |
| `pause`, `unpause` | Issuer only |
| Standard ERC-20 functions | Anyone, subject to the transfer rule above |

**Event:** `PauseSet(bool paused)` (plus ERC-20 `Transfer` and `Approval`)

**Errors:** `Paused`, `NotAllowed`, `NotIssuer`, `NotHolder`, `ZeroAddress`

## NavOracle

The issuer-posted NAV, in USDT base units per 1e18 share units, with the time it was posted.

```solidity
constructor(address issuer);
function setNav(uint256 nav) external;
function latest() external view returns (uint256 nav, uint40 updatedAt);
function issuer() external view returns (address);
```

| Function | Who may call |
| --- | --- |
| `setNav` | Issuer only. `nav` must be above 0 |
| `latest`, `issuer` | Anyone (view). `latest` returns (0, 0) before the first post |

**Event:** `NavPosted(uint256 nav, uint40 at)`

**Errors:** `NotIssuer`, `ZeroNav`, `ZeroAddress`

## BidBook

Holds allowlisted buyers' USDT bids, exits, notice periods and reservations.

```solidity
struct Bid {
  address buyer; uint256 amount; uint256 reserved;
  uint16 discountBps; uint40 notice; uint40 exitAt; bool closed;
}

constructor(address usdt, address registry, uint16 maxDiscountBps, uint40 minNotice);
function setMarket(address market) external;
function postBid(uint256 amount, uint16 discountBps, uint40 notice) external returns (uint256 bidId);
function requestExit(uint256 bidId) external;
function withdraw(uint256 bidId, uint256 amount) external;
function freeCapacity(uint40 until) external view returns (uint256);
function reserve(uint256 loanId, uint40 until, uint256 needed)
    external returns (uint256[] memory bidIds, uint256[] memory amounts);
function release(uint256 bidId, uint256 amount) external;
function fill(uint256 bidId, uint256 usdtAmount, address to) external;
function getBid(uint256 bidId) external view returns (Bid memory);
function bidCount() external view returns (uint256);
function openBidIds() external view returns (uint256[] memory);
function market() external view returns (address);
function usdt() external view returns (address);
function registry() external view returns (address);
function maxDiscountBps() external view returns (uint16);
function minNotice() external view returns (uint40);
```

| Function | Who may call | Notes |
| --- | --- | --- |
| `setMarket` | The deployer, once | Reverts `MarketAlreadySet` after that |
| `postBid` | An account with `BUYER` | Pulls USDT. `discountBps <= maxDiscountBps`, `notice >= minNotice`, at most 32 open bids |
| `requestExit` | Bid owner | Sets `exitAt = now + notice` |
| `withdraw` | Bid owner | Needs `exitAt != 0`, `now >= exitAt`, and `amount <= amount - reserved` |
| `freeCapacity` | Anyone (view) | Sum of `amount - reserved` over open bids with `exitAt == 0` or `exitAt > until`, whose buyer still holds `BUYER` |
| `reserve` | Market only | Lowest discount first. Reverts `InsufficientCapacity` |
| `release` | Market only | Returns reserved USDT to the bid's free balance |
| `fill` | Market only | `reserved -= x; amount -= x`; sends USDT to `to` |
| `getBid`, `bidCount`, `openBidIds` | Anyone (view) | `openBidIds` is lowest discount first, ties by id |

A bid closes when its `amount` reaches 0. A closed bid leaves `openBidIds`. Reserved USDT is never withdrawable.

**Events**

```solidity
event MarketSet(address market);
event BidPosted(uint256 indexed bidId, address indexed buyer, uint256 amount, uint16 discountBps, uint40 notice);
event ExitRequested(uint256 indexed bidId, uint40 exitAt);
event BidWithdrawn(uint256 indexed bidId, uint256 amount);
event Reserved(uint256 indexed bidId, uint256 indexed loanId, uint256 amount);
event Released(uint256 indexed bidId, uint256 amount);
event Filled(uint256 indexed bidId, uint256 usdtAmount);
```

**Errors:** `NotBuyer`, `NotBidOwner`, `NotMarket`, `NotDeployer`, `MarketAlreadySet`, `ZeroAddress`, `ZeroAmount`, `UnknownBid`, `BidClosed`, `ExitAlreadyRequested`, `ExitNotRequested`, `NoticeNotOver`, `ExceedsUnreserved`, `ExceedsReserved`, `DiscountTooHigh`, `NoticeTooShort`, `TooManyBids`, `InsufficientCapacity`

## StandbyMarket

The lending pool and the loans. Every token-moving function is `nonReentrant` and follows checks-effects-interactions.

```solidity
enum LoanState { None, Open, Repaid, Settled }
struct Loan { address borrower; uint256 collateral; uint256 principal; uint40 openedAt; uint40 maturity; LoanState state; }
struct Params { uint16 maxLtvBps; uint16 liqThresholdBps; uint16 haircutBps; uint16 rateBps; uint16 commitFeeBps; uint40 loanTerm; uint40 grace; uint40 maxNavAge; }

constructor(address usdt, address asset, address oracle, address bidBook, Params p);

// pool
function deposit(uint256 assets) external returns (uint256 shares);
function withdraw(uint256 shares) external returns (uint256 assets);
function totalAssets() external view returns (uint256);
function convertToAssets(uint256 shares) external view returns (uint256);
function sharesOf(address lender) external view returns (uint256);
function totalShares() external view returns (uint256);
function cash() external view returns (uint256);
function totalPrincipal() external view returns (uint256);

// loans
function previewLimits(uint256 collateral) external view returns (uint256 priceLimit, uint256 capacityLimit, uint256 maxBorrow);
function openLoan(uint256 collateral, uint256 principal) external returns (uint256 loanId);
function due(uint256 loanId) external view returns (uint256);
function quoteRepay(uint256 loanId) external view returns (uint256 dueNow, uint256 fees);
function repay(uint256 loanId) external;
function isSettleable(uint256 loanId) external view returns (bool);
function settle(uint256 loanId) external;
function getLoan(uint256 loanId) external view returns (Loan memory, uint256[] memory bidIds, uint256[] memory reserved);
function loanCount() external view returns (uint256);
function params() external view returns (Params memory);

// wiring
function usdt() external view returns (address);
function asset() external view returns (address);
function oracle() external view returns (address);
function bidBook() external view returns (address);
```

| Function | Who may call | Notes |
| --- | --- | --- |
| `deposit` | Anyone | Pulls USDT, mints pool shares (rounded down). `ZeroAmount`, `ZeroShares` |
| `withdraw` | A lender with shares | `InsufficientShares`, `InsufficientCash` if idle USDT is short |
| `previewLimits` | Anyone (view) | Price limit, capacity limit and their minimum |
| `openLoan` | Any allowlisted holder | Needs fresh NAV, unpaused asset, `principal <= priceLimit`, capacity, idle cash. Pulls collateral, sends USDT |
| `due` | Anyone (view) | Principal plus simple interest to now; 0 unless the loan is open |
| `quoteRepay` | Anyone (view) | `repay` pulls `dueNow + fees` |
| `repay` | The loan's borrower | At any time while the loan is open, including after maturity plus grace, until someone settles it |
| `isSettleable` | Anyone (view) | Open and (past maturity plus grace, or debt above the liquidation threshold at a fresh NAV) |
| `settle` | Anyone | Reverts `NotSettleable` if not settleable |
| `getLoan` | Anyone (view) | Loan plus its reserved bid ids and amounts |

**Events**

```solidity
event Deposited(address indexed lender, uint256 assets, uint256 shares);
event Withdrawn(address indexed lender, uint256 assets, uint256 shares);
event LoanOpened(uint256 indexed loanId, address indexed borrower, uint256 collateral, uint256 principal, uint40 maturity);
event LoanRepaid(uint256 indexed loanId, uint256 paid, uint256 commitmentFees);
event LoanSettled(uint256 indexed loanId, uint256 recovered, uint256 collateralToBuyers, uint256 collateralReturned);
event Shortfall(uint256 indexed loanId, uint256 amount);
```

**Errors:** `ZeroAddress`, `BadConfig`, `BadParams`, `ZeroAmount`, `ZeroShares`, `InsufficientShares`, `AssetPaused`, `StaleNav`, `AboveLtv`, `InsufficientCash`, `UnknownLoan`, `LoanNotOpen`, `NotBorrower`, `NotSettleable`. Capacity failures surface as the bid book's `InsufficientCapacity`.

### Constructor parameters (demo)

| Name | Demo value | Meaning |
| --- | --- | --- |
| `maxLtvBps` | 8500 | Price-based limit |
| `liqThresholdBps` | 9000 | Settleable early above this debt to collateral ratio |
| `haircutBps` | 1000 | Capacity haircut |
| `maxDiscountBps` | 800 | Highest bid discount accepted (set on the bid book) |
| `minNotice` | 600 | Seconds (set on the bid book) |
| `loanTerm` | 900 | Seconds from open to maturity |
| `grace` | 120 | Seconds after maturity |
| `rateBps` | 800 | Interest per year, simple |
| `commitFeeBps` | 200 | Per year on reserved USDT, paid to buyers at repayment |
| `maxNavAge` | 86400 | Seconds. Older NAV blocks new loans |

## Roles at deployment

The deploy script grants `CONTRACT` to the market and the bid book, `HOLDER` to the borrower, and `BUYER` to both buyers.
