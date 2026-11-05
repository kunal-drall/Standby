// viem clients. One public client per RPC URL (JSON-RPC batching on, short polling for the
// 1-2 s block time); wallet clients are built per transaction from a local private key.
import { whitechainSepolia } from '@standby/shared';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

const publicClients = new Map<string, PublicClient>();
const chainIds = new Map<string, Promise<number>>();

export function publicClientFor(rpcUrl: string): PublicClient {
  let client = publicClients.get(rpcUrl);
  if (!client) {
    client = createPublicClient({
      transport: http(rpcUrl, { batch: { wait: 16 }, timeout: 15_000, retryCount: 1 }),
      pollingInterval: 1_000,
    });
    publicClients.set(rpcUrl, client);
  }
  return client;
}

/** eth_chainId, cached per RPC URL (dropped on failure so it is retried). */
export function chainIdFor(rpcUrl: string): Promise<number> {
  let id = chainIds.get(rpcUrl);
  if (!id) {
    id = publicClientFor(rpcUrl).getChainId();
    id.catch(() => chainIds.delete(rpcUrl));
    chainIds.set(rpcUrl, id);
  }
  return id;
}

/** Whitechain Sepolia with the chosen RPC URL, or a generic chain for a local node with another id. */
export function chainFor(chainId: number, rpcUrl: string): Chain {
  if (chainId === whitechainSepolia.id) {
    return defineChain({ ...whitechainSepolia, rpcUrls: { default: { http: [rpcUrl] } } });
  }
  return defineChain({
    id: chainId,
    name: `Local chain ${chainId}`,
    nativeCurrency: whitechainSepolia.nativeCurrency,
    rpcUrls: { default: { http: [rpcUrl] } },
    testnet: true,
  });
}

const accounts = new Map<Hex, PrivateKeyAccount>();

export function accountFor(key: Hex): PrivateKeyAccount {
  let account = accounts.get(key);
  if (!account) {
    account = privateKeyToAccount(key);
    accounts.set(key, account);
  }
  return account;
}

export async function walletClientFor(key: Hex, rpcUrl: string): Promise<WalletClient & { account: PrivateKeyAccount; chain: Chain }> {
  const chain = chainFor(await chainIdFor(rpcUrl), rpcUrl);
  const account = accountFor(key);
  return createWalletClient({ account, chain, transport: http(rpcUrl, { timeout: 30_000 }) }) as WalletClient & {
    account: PrivateKeyAccount;
    chain: Chain;
  };
}
