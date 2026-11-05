// Values from docs/interfaces.md sections 1 and 4. Checked against the live chain on 2026-11-06:
// eth_chainId on the RPC returns 0x752 (1874); USDT decimals() returns 6. Still read decimals at runtime.

export const CHAIN_ID = 1874 as const;
export const CHAIN_NAME = 'Whitechain Sepolia';
export const RPC_URL = 'https://rpc.testnet.whitechain.io';
export const EXPLORER_URL = 'https://explorer.testnet.whitechain.io';
export const VERIFIER_URL = 'https://explorer.testnet.whitechain.io/api/';
export const FAUCET_URL = 'https://faucet.testnet.whitechain.io';
export const NATIVE_SYMBOL = 'WBT';

/** The official test USDT. Every payment must use it; self-minted stablecoins do not count. */
export const USDT_ADDRESS = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7' as const;

/** AllowlistRegistry role bitmask. */
export const Role = {
  HOLDER: 1,
  BUYER: 2,
  CONTRACT: 4,
} as const;
export type RoleName = keyof typeof Role;

/** StandbyMarket LoanState enum, in declaration order. */
export const LoanState = {
  None: 0,
  Open: 1,
  Repaid: 2,
  Settled: 3,
} as const;
export type LoanStateName = keyof typeof LoanState;

export function loanStateName(value: number): LoanStateName {
  const entry = Object.entries(LoanState).find(([, v]) => v === value);
  if (!entry) throw new Error(`Unknown loan state ${value}`);
  return entry[0] as LoanStateName;
}

/** Market constructor parameters used for the demo deployment (interfaces.md section 4). */
export const DEMO_PARAMS = {
  maxLtvBps: 8500,
  liqThresholdBps: 9000,
  haircutBps: 1000,
  maxDiscountBps: 800,
  minNotice: 600,
  loanTerm: 900,
  grace: 120,
  rateBps: 800,
  commitFeeBps: 200,
  maxNavAge: 86400,
} as const;
export type MarketParams = { [K in keyof typeof DEMO_PARAMS]: number };

/** The deploy script's wallet roles, matching the `<ROLE>_PK` names in `.env`. */
export const DEMO_ROLES = ['DEPLOYER', 'LENDER', 'BUYER1', 'BUYER2', 'BORROWER', 'KEEPER'] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];
