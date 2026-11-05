// On-chain assertions for the E2E tests. Reads the same VITE_* settings the app uses (web/.env.local
// or process env), so the tests check what the browser did against the chain itself.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  navOracleAbi,
  bidBookAbi,
  restrictedAssetAbi,
  standbyMarketAbi,
  usdtAbi,
  whitechainSepolia,
} from '@standby/shared';
import { createPublicClient, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

function loadEnv(): Record<string, string> {
  const file = join(import.meta.dirname, '..', '.env.local');
  const out: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]!] = m[2]!.trim();
    }
  }
  return { ...out, ...(process.env as Record<string, string>) };
}

const env = loadEnv();
const need = (k: string) => {
  const v = env[k];
  if (!v) throw new Error(`${k} missing: run scripts/local-chain.sh or set it for testnet`);
  return v;
};

export const rpcUrl = need('VITE_RPC_URL');
export const isLocal = /127\.0\.0\.1|localhost/.test(rpcUrl);
export const addr = {
  usdt: need('VITE_USDT_ADDRESS') as Address,
  asset: need('VITE_ASSET_ADDRESS') as Address,
  bidBook: need('VITE_BIDBOOK_ADDRESS') as Address,
  market: need('VITE_MARKET_ADDRESS') as Address,
  oracle: need('VITE_ORACLE_ADDRESS') as Address,
};
export const party = {
  issuer: privateKeyToAccount(need('VITE_ISSUER_PK') as Hex).address,
  lender: privateKeyToAccount(need('VITE_LENDER_PK') as Hex).address,
  buyer1: privateKeyToAccount(need('VITE_BUYER1_PK') as Hex).address,
  buyer2: privateKeyToAccount(need('VITE_BUYER2_PK') as Hex).address,
  borrower: privateKeyToAccount(need('VITE_BORROWER_PK') as Hex).address,
};

export const client = createPublicClient({ chain: whitechainSepolia, transport: http(rpcUrl) });

export const usdtBalance = (who: Address) =>
  client.readContract({ address: addr.usdt, abi: usdtAbi, functionName: 'balanceOf', args: [who] });
export const shareBalance = (who: Address) =>
  client.readContract({ address: addr.asset, abi: restrictedAssetAbi, functionName: 'balanceOf', args: [who] });
export const loanCount = () =>
  client.readContract({ address: addr.market, abi: standbyMarketAbi, functionName: 'loanCount' });
export const getLoan = (id: bigint) =>
  client.readContract({ address: addr.market, abi: standbyMarketAbi, functionName: 'getLoan', args: [id] });
export const bidCount = () => client.readContract({ address: addr.bidBook, abi: bidBookAbi, functionName: 'bidCount' });
export const getBid = (id: bigint) =>
  client.readContract({ address: addr.bidBook, abi: bidBookAbi, functionName: 'getBid', args: [id] });
export const latestNav = () => client.readContract({ address: addr.oracle, abi: navOracleAbi, functionName: 'latest' });
export const previewLimits = (collateral: bigint) =>
  client.readContract({ address: addr.market, abi: standbyMarketAbi, functionName: 'previewLimits', args: [collateral] });
export const marketCash = () => client.readContract({ address: addr.market, abi: standbyMarketAbi, functionName: 'cash' });
export const sharesOf = (who: Address) =>
  client.readContract({ address: addr.market, abi: standbyMarketAbi, functionName: 'sharesOf', args: [who] });

/** Moves chain time forward: instant on the local fork, real waiting on testnet. */
export async function advanceTime(seconds: number): Promise<void> {
  if (isLocal) {
    await client.request({ method: 'evm_increaseTime' as never, params: [seconds] as never });
    await client.request({ method: 'evm_mine' as never, params: [] as never });
  } else {
    await new Promise((r) => setTimeout(r, seconds * 1000));
  }
}

/** Polls until `check` returns true or the timeout passes. */
export async function waitFor(check: () => Promise<boolean>, timeoutMs = 90_000, everyMs = 1_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error('timed out waiting for chain state');
}
