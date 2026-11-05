import { whitechainSepolia } from '@standby/shared';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Config } from './config.js';

export type KeeperWallet = WalletClient<Transport, Chain, Account>;

function transport(config: Config) {
  return http(config.WC_RPC_URL, { timeout: config.RPC_TIMEOUT_MS, retryCount: 2 });
}

export function createClient(config: Config): PublicClient {
  return createPublicClient({
    chain: whitechainSepolia,
    transport: transport(config),
    pollingInterval: 1_000,
  }) as PublicClient;
}

/** Wallet for settle calls. Settling needs no role: anyone may call it. */
export function createKeeperWallet(config: Config): KeeperWallet | null {
  if (!config.KEEPER_PK) return null;
  return createWalletClient({
    account: privateKeyToAccount(config.KEEPER_PK as `0x${string}`),
    chain: whitechainSepolia,
    transport: transport(config),
  });
}
