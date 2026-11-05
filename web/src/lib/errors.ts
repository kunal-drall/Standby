// Turns viem errors into a custom error name plus a plain-English explanation. Every error in
// docs/interfaces.md section 5a is mapped, plus the extra ones the contracts and OpenZeppelin define.
import {
  allowlistRegistryAbi,
  bidBookAbi,
  navOracleAbi,
  restrictedAssetAbi,
  standbyMarketAbi,
} from '@standby/shared';
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  parseAbi,
  HttpRequestError,
  InsufficientFundsError,
  TimeoutError,
  type Abi,
  type Hex,
} from 'viem';

type AbiError = Extract<Abi[number], { type: 'error' }>;

/** Every custom error from the five contracts, deduplicated by name, for decoding nested reverts. */
export const ERROR_ABI: AbiError[] = (() => {
  const seen = new Set<string>();
  const out: AbiError[] = [];
  const all = [
    ...standbyMarketAbi,
    ...bidBookAbi,
    ...restrictedAssetAbi,
    ...allowlistRegistryAbi,
    ...navOracleAbi,
    // Added to BidBook after the shared ABI snapshot; harmless duplicates once it is regenerated.
    ...parseAbi(['error NoticeTooLong()', 'error StillBuyer()']),
  ] as Abi;
  for (const item of all) {
    if (item.type === 'error' && !seen.has(item.name)) {
      seen.add(item.name);
      out.push(item);
    }
  }
  return out;
})();

export const ERROR_TEXT: Record<string, string> = {
  // AllowlistRegistry, RestrictedAsset, NavOracle
  NotIssuer: 'Only the issuer wallet can do this. Switch "Acting as" to Issuer.',
  InvalidRoles: 'The roles value has bits other than HOLDER, BUYER and CONTRACT.',
  ZeroAddress: 'An address is the zero address.',
  Paused: 'The issuer has paused the asset, so no shares can move until it is unpaused.',
  NotAllowed: 'Shares only move between allowlisted wallets, and the sender or the receiver is not on the allowlist.',
  NotHolder: 'The receiving wallet does not have the HOLDER role, so shares cannot be minted to it.',
  ZeroNav: 'The NAV must be greater than zero.',
  // BidBook
  NotBuyer: 'Only wallets with the BUYER role can post bids. The issuer grants it on the allowlist.',
  NotBidOwner: 'Only the buyer who posted this bid can change it.',
  NotMarket: 'Only the market contract can reserve, release or fill bids.',
  NotDeployer: 'Only the wallet that deployed the bid book can set its market.',
  MarketAlreadySet: 'The bid book already has its market set.',
  ZeroAmount: 'The amount must be greater than zero.',
  UnknownBid: 'There is no bid with that id.',
  BidClosed: 'This bid is closed: it was fully withdrawn or filled.',
  ExitAlreadyRequested: 'An exit was already requested for this bid; wait for the notice period to end.',
  ExitNotRequested: 'Request an exit first. Withdrawal opens when the notice period that starts then has ended.',
  NoticeNotOver: 'The notice period has not ended yet.',
  ExceedsUnreserved: 'That is more than the bid’s unreserved USDT. Reserved USDT backs open loans and cannot be withdrawn.',
  ExceedsReserved: 'That is more than the USDT reserved on this bid.',
  DiscountTooHigh: 'The discount is above the highest discount the bid book accepts.',
  NoticeTooShort: 'The notice period is shorter than the bid book minimum.',
  TooManyBids: 'Too many open bids: the bid book holds at most 32, and each buyer has a per-wallet limit too.',
  NoticeTooLong: 'The notice period is longer than the bid book maximum (30 days).',
  StillBuyer: 'This buyer still holds the BUYER role, so its bid cannot be evicted.',
  InsufficientCapacity: 'Not enough free bid USDT to back this loan after the haircut. Borrow less or wait for more bids.',
  // StandbyMarket
  BadConfig: 'The market was deployed with contracts that do not match each other.',
  BadParams: 'The market was deployed with invalid parameters.',
  ZeroShares: 'The deposit is too small to mint any pool shares.',
  InsufficientShares: 'That is more pool shares than this wallet owns.',
  AssetPaused: 'The asset is paused, so no new loan can open.',
  StaleNav: 'The NAV is older than the maximum age. The issuer must post a new NAV before loans can open.',
  AboveLtv: 'The amount is above the price limit (max LTV × collateral value at NAV).',
  InsufficientCash: 'The pool does not have enough idle USDT for this right now.',
  UnknownLoan: 'There is no loan with that id.',
  LoanNotOpen: 'This loan is not open: it was already repaid or settled.',
  NotBorrower: 'Only the borrower of this loan can repay it. Switch "Acting as" to Borrower.',
  NotSettleable: 'This loan cannot be settled yet: it is before maturity plus grace and within the liquidation threshold.',
  // OpenZeppelin
  ERC20InsufficientBalance: 'The wallet’s token balance is too low for this.',
  ERC20InsufficientAllowance: 'The contract is not approved to move that many tokens.',
  ERC20InvalidApprover: 'The approving address is invalid.',
  ERC20InvalidReceiver: 'The receiving address is invalid.',
  ERC20InvalidSender: 'The sending address is invalid.',
  ERC20InvalidSpender: 'The spender address is invalid.',
  SafeERC20FailedOperation: 'A token transfer failed. Check the balance and the approval.',
  ReentrancyGuardReentrantCall: 'A contract call tried to re-enter a protected function.',
  SafeCastOverflowedUintDowncast: 'A number is too large for the contract to store.',
  // Off-chain
  InsufficientFunds: 'The wallet has no WBT (or too little) to pay for gas. Get some from the Whitechain faucet.',
  RpcUnreachable: 'The RPC node did not answer. Check the network status chip or the RPC URL in Settings.',
  TransactionReverted: 'The transaction was mined but reverted.',
  NoKey: 'There is no key for the active wallet. Add one in Settings.',
};

export type DecodedError = {
  /** Custom error name such as "NoticeNotOver", or a short label for other failures. */
  name: string;
  /** Plain English. */
  message: string;
  /** Raw message for unknown errors only (never repeats a decoded name). */
  detail?: string;
};

function fromName(name: string, args?: readonly unknown[]): DecodedError {
  if (name === 'Error' && typeof args?.[0] === 'string') {
    return { name: 'Reverted', message: `The contract reverted: “${args[0]}”.` };
  }
  if (name === 'Panic') {
    return { name: 'Panic', message: `The contract hit an internal check (panic code ${String(args?.[0] ?? '?')}).` };
  }
  return { name, message: ERROR_TEXT[name] ?? 'The contract rejected the call.' };
}

function decodeRaw(data: Hex): DecodedError | null {
  try {
    const decoded = decodeErrorResult({ abi: ERROR_ABI, data });
    return fromName(decoded.errorName, decoded.args as readonly unknown[] | undefined);
  } catch {
    return null;
  }
}

export function decodeError(error: unknown): DecodedError {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      if (revert.data?.errorName) return fromName(revert.data.errorName, revert.data.args);
      if (revert.raw) {
        const fromRaw = decodeRaw(revert.raw);
        if (fromRaw) return fromRaw;
      }
      if (revert.reason) return { name: 'Reverted', message: `The contract reverted: “${revert.reason}”.` };
    }
    const withData = error.walk((e) => {
      const data = (e as { data?: unknown }).data;
      return typeof data === 'string' && /^0x[0-9a-fA-F]{8}/.test(data);
    }) as { data?: Hex } | null;
    if (withData?.data) {
      const fromRaw = decodeRaw(withData.data);
      if (fromRaw) return fromRaw;
    }
    if (error.walk((e) => e instanceof InsufficientFundsError)) return fromName('InsufficientFunds');
    if (error.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError)) return fromName('RpcUnreachable');
    return { name: 'Failed', message: 'The request failed.', detail: error.shortMessage };
  }
  if (error instanceof Error) {
    const known = ERROR_TEXT[error.name];
    if (known) return { name: error.name, message: error.message || known };
    return { name: 'Failed', message: 'Something went wrong.', detail: error.message };
  }
  return { name: 'Failed', message: 'Something went wrong.', detail: String(error) };
}

/** Short text for read failures shown in page error states. */
export function readErrorText(error: unknown): string {
  const d = decodeError(error);
  if (d.name === 'RpcUnreachable') return d.message;
  if (error instanceof BaseError) return error.shortMessage;
  return d.detail ?? d.message;
}

/** An error with a name the panel shows as-is. */
export class NamedError extends Error {
  constructor(name: string, message?: string) {
    super(message ?? ERROR_TEXT[name] ?? name);
    this.name = name;
  }
}
