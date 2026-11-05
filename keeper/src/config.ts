import { CHAIN_ID, RPC_URL, USDT_ADDRESS } from '@standby/shared';
import type { Address } from 'viem';
import { z } from 'zod';

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'expected a 0x address')
  .transform((v) => v as Address);
const optionalAddress = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(address.optional());

const schema = z.object({
  WC_RPC_URL: z.url().default(RPC_URL),
  WC_CHAIN_ID: z.coerce.number().int().default(CHAIN_ID),
  USDT_ADDRESS: address.default(USDT_ADDRESS as Address),
  KEEPER_PK: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'expected a 32-byte hex key').optional()),
  ORACLE_ADDRESS: optionalAddress,
  MARKET_ADDRESS: optionalAddress,
  BIDBOOK_ADDRESS: optionalAddress,
  PORT: z.coerce.number().int().min(1).max(65535).default(8788),
  POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(15_000),
  RPC_TIMEOUT_MS: z.coerce.number().int().min(500).default(10_000),
});

export type Config = z.infer<typeof schema>;

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
