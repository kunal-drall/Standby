// Every build-time setting the web app reads, in one place. All values are optional; missing
// addresses or keys show a "not configured" state instead of failing.
import { CHAIN_ID, RPC_URL, deployments } from '@standby/shared';
import { getAddress, isAddress, type Address, type Hex } from 'viem';
import type { Party } from './routes';

const env = import.meta.env;

function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

function toAddress(value: string): Address | null {
  return isAddress(value, { strict: false }) ? getAddress(value) : null;
}

export type ContractKey = 'usdt' | 'registry' | 'asset' | 'oracle' | 'bidBook' | 'market';

export const CONTRACT_KEYS: ContractKey[] = ['usdt', 'registry', 'asset', 'oracle', 'bidBook', 'market'];

export const CONTRACT_LABEL: Record<ContractKey, string> = {
  usdt: 'USDT',
  registry: 'AllowlistRegistry',
  asset: 'RestrictedAsset',
  oracle: 'NavOracle',
  bidBook: 'BidBook',
  market: 'StandbyMarket',
};

export const CONTRACT_ENV: Record<ContractKey, string> = {
  usdt: 'VITE_USDT_ADDRESS',
  registry: 'VITE_REGISTRY_ADDRESS',
  asset: 'VITE_ASSET_ADDRESS',
  oracle: 'VITE_ORACLE_ADDRESS',
  bidBook: 'VITE_BIDBOOK_ADDRESS',
  market: 'VITE_MARKET_ADDRESS',
};

// Each env var is read by its full name so Vite can replace it at build time.
const RAW_ADDRESSES: Record<ContractKey, string> = {
  usdt: clean(env.VITE_USDT_ADDRESS) || deployments.usdt,
  registry: clean(env.VITE_REGISTRY_ADDRESS) || deployments.contracts.AllowlistRegistry,
  asset: clean(env.VITE_ASSET_ADDRESS) || deployments.contracts.RestrictedAsset,
  oracle: clean(env.VITE_ORACLE_ADDRESS) || deployments.contracts.NavOracle,
  bidBook: clean(env.VITE_BIDBOOK_ADDRESS) || deployments.contracts.BidBook,
  market: clean(env.VITE_MARKET_ADDRESS) || deployments.contracts.StandbyMarket,
};

export const ADDRESSES: Record<ContractKey, Address | null> = {
  usdt: toAddress(RAW_ADDRESSES.usdt),
  registry: toAddress(RAW_ADDRESSES.registry),
  asset: toAddress(RAW_ADDRESSES.asset),
  oracle: toAddress(RAW_ADDRESSES.oracle),
  bidBook: toAddress(RAW_ADDRESSES.bidBook),
  market: toAddress(RAW_ADDRESSES.market),
};

export type Contracts = Record<ContractKey, Address>;

export const MISSING_CONTRACTS: ContractKey[] = CONTRACT_KEYS.filter((k) => ADDRESSES[k] === null);

/** All six addresses, or null while any is missing. */
export const CONTRACTS: Contracts | null = MISSING_CONTRACTS.length === 0 ? (ADDRESSES as Contracts) : null;

export const DEFAULT_RPC_URL = clean(env.VITE_RPC_URL) || RPC_URL;

function parseBlock(value: string): bigint | null {
  return /^\d+$/.test(value) ? BigInt(value) : null;
}

export const START_BLOCK: bigint = parseBlock(clean(env.VITE_START_BLOCK)) ?? BigInt(deployments.startBlock);

export const DOCS_URL = clean(env.VITE_DOCS_URL) || 'https://github.com/kunal-drall/Standby/tree/main/docs';

/** Optional keeper read API. The app reads the chain directly; this only adds a health line. */
export const KEEPER_API = clean(env.VITE_KEEPER_API).replace(/\/+$/, '') || null;

export const EXPECTED_CHAIN_ID = CHAIN_ID;

/** getLogs range limit per request. */
export const LOG_CHUNK = 5_000n;

export const PARTY_ENV: Record<Party, string> = {
  Issuer: 'VITE_ISSUER_PK',
  Lender: 'VITE_LENDER_PK',
  'Buyer 1': 'VITE_BUYER1_PK',
  'Buyer 2': 'VITE_BUYER2_PK',
  Borrower: 'VITE_BORROWER_PK',
};

/** "0xabc..." or "abc..." (64 hex chars) -> Hex, else null. Never logged. */
export function normalizeKey(value: string | undefined | null): Hex | null {
  const v = (value ?? '').trim();
  const hex = v.startsWith('0x') || v.startsWith('0X') ? v.slice(2) : v;
  return /^[0-9a-fA-F]{64}$/.test(hex) ? (`0x${hex.toLowerCase()}` as Hex) : null;
}

/** Testnet throwaway demo keys baked in at build time (interfaces.md section 2). */
export const ENV_KEYS: Record<Party, Hex | null> = {
  Issuer: normalizeKey(env.VITE_ISSUER_PK),
  Lender: normalizeKey(env.VITE_LENDER_PK),
  'Buyer 1': normalizeKey(env.VITE_BUYER1_PK),
  'Buyer 2': normalizeKey(env.VITE_BUYER2_PK),
  Borrower: normalizeKey(env.VITE_BORROWER_PK),
};
