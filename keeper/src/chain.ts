import { navOracleAbi, whitechainSepolia } from '@standby/shared';
import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import type { Config } from './config.js';

export function createClient(config: Config): PublicClient {
  return createPublicClient({
    chain: whitechainSepolia,
    transport: http(config.WC_RPC_URL, { timeout: config.RPC_TIMEOUT_MS, retryCount: 2 }),
  }) as PublicClient;
}

/** What the read API needs from the chain; an interface so tests can stub it. */
export type ChainReader = {
  blockNumber(): Promise<bigint>;
  /** Unix seconds of the latest NAV, or null before the oracle is deployed. */
  navUpdatedAt(): Promise<number | null>;
  /** Unix seconds of the latest block. */
  now(): Promise<number>;
};

export function createChainReader(client: PublicClient, oracle?: Address): ChainReader {
  return {
    blockNumber: () => client.getBlockNumber(),
    async navUpdatedAt() {
      if (!oracle) return null;
      const [, updatedAt] = await client.readContract({
        address: oracle,
        abi: navOracleAbi,
        functionName: 'latest',
      });
      return Number(updatedAt);
    },
    async now() {
      const block = await client.getBlock();
      return Number(block.timestamp);
    },
  };
}
