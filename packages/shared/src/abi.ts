// PLACEHOLDER ABIs, written by hand from docs/interfaces.md section 5 so the keeper and web can
// start before the contracts exist. C5 replaces this file with ABIs exported from Foundry's out/.
// Do not add functions here that the spec does not list.
import { erc20Abi, parseAbi } from 'viem';

export const allowlistRegistryAbi = parseAbi([
  'function setRoles(address account, uint8 roles)',
  'function hasRole(address account, uint8 role) view returns (bool)',
  'function isAllowed(address account) view returns (bool)',
  'event RolesSet(address indexed account, uint8 roles)',
]);

export const restrictedAssetAbi = [
  ...erc20Abi,
  ...parseAbi([
    'function mint(address to, uint256 amount)',
    'function pause()',
    'function unpause()',
    'error Paused()',
    'error NotAllowed()',
  ]),
] as const;

export const navOracleAbi = parseAbi([
  'function setNav(uint256 nav)',
  'function latest() view returns (uint256 nav, uint40 updatedAt)',
  'event NavPosted(uint256 nav, uint40 at)',
]);

export const bidBookAbi = parseAbi([
  'struct Bid { address buyer; uint256 amount; uint256 reserved; uint16 discountBps; uint40 notice; uint40 exitAt; bool closed; }',
  'function setMarket(address market)',
  'function postBid(uint256 amount, uint16 discountBps, uint40 notice) returns (uint256 bidId)',
  'function requestExit(uint256 bidId)',
  'function withdraw(uint256 bidId, uint256 amount)',
  'function freeCapacity(uint40 until) view returns (uint256)',
  'function reserve(uint40 until, uint256 needed) returns (uint256[] bidIds, uint256[] amounts)',
  'function release(uint256 bidId, uint256 amount)',
  'function fill(uint256 bidId, uint256 usdtAmount, address to)',
  'function getBid(uint256 bidId) view returns (Bid)',
  'function bidCount() view returns (uint256)',
  'event BidPosted(uint256 indexed bidId, address indexed buyer, uint256 amount, uint16 discountBps, uint40 notice)',
  'event ExitRequested(uint256 indexed bidId, uint40 exitAt)',
  'event BidWithdrawn(uint256 indexed bidId, uint256 amount)',
  'event Reserved(uint256 indexed bidId, uint256 indexed loanId, uint256 amount)',
  'event Released(uint256 indexed bidId, uint256 amount)',
  'event Filled(uint256 indexed bidId, uint256 usdtAmount)',
  'error DiscountTooHigh()',
  'error NoticeTooShort()',
  'error TooManyBids()',
  'error InsufficientCapacity()',
]);

export const standbyMarketAbi = parseAbi([
  'struct Loan { address borrower; uint256 collateral; uint256 principal; uint40 openedAt; uint40 maturity; uint8 state; }',
  'function deposit(uint256 assets) returns (uint256 shares)',
  'function withdraw(uint256 shares) returns (uint256 assets)',
  'function totalAssets() view returns (uint256)',
  'function previewLimits(uint256 collateral) view returns (uint256 priceLimit, uint256 capacityLimit, uint256 maxBorrow)',
  'function openLoan(uint256 collateral, uint256 principal) returns (uint256 loanId)',
  'function due(uint256 loanId) view returns (uint256)',
  'function repay(uint256 loanId)',
  'function isSettleable(uint256 loanId) view returns (bool)',
  'function settle(uint256 loanId)',
  'function getLoan(uint256 loanId) view returns (Loan loan, uint256[] bidIds, uint256[] reserved)',
  'event Deposited(address indexed lender, uint256 assets, uint256 shares)',
  'event Withdrawn(address indexed lender, uint256 assets, uint256 shares)',
  'event LoanOpened(uint256 indexed loanId, address indexed borrower, uint256 collateral, uint256 principal, uint40 maturity)',
  'event LoanRepaid(uint256 indexed loanId, uint256 paid, uint256 commitmentFees)',
  'event LoanSettled(uint256 indexed loanId, uint256 recovered, uint256 collateralToBuyers, uint256 collateralReturned)',
  'event Shortfall(uint256 indexed loanId, uint256 amount)',
  'error StaleNav()',
  'error AboveLtv()',
  'error InsufficientCash()',
]);

export const usdtAbi = erc20Abi;
