import { CHAIN_ID, RPC_URL, deployments } from '@standby/shared';
import type { Address } from 'viem';
import { z } from 'zod';

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 0x address')
  .transform((v) => v as Address);

/** Empty string or missing -> fallback (deployments.json), else must be a valid address. */
const addressOr = (fallback: string) =>
  z
    .string()
    .default('')
    .transform((v) => (v ? v : fallback || undefined))
    .pipe(address.optional());

const schema = z.object({
  WC_RPC_URL: z.url().default(RPC_URL),
  WC_CHAIN_ID: z.coerce.number().int().default(CHAIN_ID),
  USDT_ADDRESS: addressOr(deployments.usdt),
  REGISTRY_ADDRESS: addressOr(deployments.contracts.AllowlistRegistry),
  ASSET_ADDRESS: addressOr(deployments.contracts.RestrictedAsset),
  ORACLE_ADDRESS: addressOr(deployments.contracts.NavOracle),
  BIDBOOK_ADDRESS: addressOr(deployments.contracts.BidBook),
  MARKET_ADDRESS: addressOr(deployments.contracts.StandbyMarket),
  START_BLOCK: z.coerce.bigint().default(BigInt(deployments.startBlock)),
  KEEPER_PK: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'expected a 32-byte hex key').optional()),
  PORT: z.coerce.number().int().min(1).max(65535).default(8788),
  POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(15_000),
  RPC_TIMEOUT_MS: z.coerce.number().int().min(500).default(10_000),
  MAX_SETTLE_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
});

export type Config = z.infer<typeof schema>;

export type Addresses = {
  usdt: Address;
  registry: Address;
  asset: Address;
  oracle: Address;
  bidBook: Address;
  market: Address;
};

/** Parses process env. Never logs values: KEEPER_PK is a secret. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid keeper config: ${fields}`);
  }
  if (parsed.data.WC_CHAIN_ID !== CHAIN_ID) {
    throw new Error(`WC_CHAIN_ID is ${parsed.data.WC_CHAIN_ID}, expected ${CHAIN_ID}`);
  }
  return parsed.data;
}

/** All six addresses, or null while any contract is not deployed. */
export function addressesOf(c: Config): Addresses | null {
  const { USDT_ADDRESS, REGISTRY_ADDRESS, ASSET_ADDRESS, ORACLE_ADDRESS, BIDBOOK_ADDRESS, MARKET_ADDRESS } = c;
  if (!USDT_ADDRESS || !REGISTRY_ADDRESS || !ASSET_ADDRESS || !ORACLE_ADDRESS || !BIDBOOK_ADDRESS || !MARKET_ADDRESS) {
    return null;
  }
  return {
    usdt: USDT_ADDRESS,
    registry: REGISTRY_ADDRESS,
    asset: ASSET_ADDRESS,
    oracle: ORACLE_ADDRESS,
    bidBook: BIDBOOK_ADDRESS,
    market: MARKET_ADDRESS,
  };
}
