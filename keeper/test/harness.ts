// Test harness: a throwaway anvil node (chain id 1874) with the five contracts and a 6-decimal mock
// USDT deployed from Foundry's artifacts, seeded like the demo. Needs `anvil` on PATH and
// `forge build` output in contracts/out; tests skip otherwise.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { whitechainSepolia } from '@standby/shared';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import type { Addresses } from '../src/config.js';

const OUT = join(import.meta.dirname, '../../contracts/out');
const MNEMONIC = 'test test test test test test test test test test test junk';

export const hasToolchain = (): boolean =>
  spawnSync('anvil', ['--version']).status === 0 && existsSync(join(OUT, 'StandbyMarket.sol/StandbyMarket.json'));

function artifact(file: string, name: string): { abi: Abi; bytecode: Hex } {
  const json = JSON.parse(readFileSync(join(OUT, file, `${name}.json`), 'utf8'));
  return { abi: json.abi as Abi, bytecode: json.bytecode.object as Hex };
}

export type Harness = {
  rpcUrl: string;
  client: PublicClient;
  addresses: Addresses;
  startBlock: bigint;
  accounts: Record<'issuer' | 'lender' | 'buyer1' | 'buyer2' | 'borrower' | 'keeper', ReturnType<typeof mnemonicToAccount>>;
  keeperKey: Hex;
  write(who: keyof Harness['accounts'], address: Address, abi: Abi, functionName: string, args: unknown[]): Promise<void>;
  increaseTime(seconds: number): Promise<void>;
  stop(): void;
};

export async function startHarness(port: number): Promise<Harness> {
  const anvil: ChildProcess = spawn('anvil', ['--port', String(port), '--chain-id', '1874', '--silent'], {
    stdio: 'ignore',
  });
  const rpcUrl = `http://127.0.0.1:${port}`;
  const client = createPublicClient({ chain: whitechainSepolia, transport: http(rpcUrl), pollingInterval: 100 }) as PublicClient;
  for (let i = 0; i < 100; i++) {
    try {
      await client.getChainId();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const names = ['issuer', 'lender', 'buyer1', 'buyer2', 'borrower', 'keeper'] as const;
  const accounts = Object.fromEntries(
    names.map((n, i) => [n, mnemonicToAccount(MNEMONIC, { addressIndex: i })]),
  ) as Harness['accounts'];
  const keeperKey = `0x${Buffer.from(accounts.keeper.getHdKey().privateKey!).toString('hex')}` as Hex;
  const wallet = (who: keyof Harness['accounts']) =>
    createWalletClient({ account: accounts[who], chain: whitechainSepolia, transport: http(rpcUrl) });

  const deploy = async (file: string, name: string, args: unknown[]): Promise<Address> => {
    const { abi, bytecode } = artifact(file, name);
    const hash = await wallet('issuer').deployContract({ abi, bytecode, args });
    const receipt = await client.waitForTransactionReceipt({ hash });
    return receipt.contractAddress!;
  };
  const write: Harness['write'] = async (who, address, abi, functionName, args) => {
    const hash = await wallet(who).writeContract({ address, abi, functionName, args } as never);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${functionName} reverted`);
  };

  const startBlock = await client.getBlockNumber();
  const issuer = accounts.issuer.address;
  const usdt = await deploy('Base.t.sol', 'MockUSDT', [6]);
  const registry = await deploy('AllowlistRegistry.sol', 'AllowlistRegistry', [issuer]);
  const asset = await deploy('RestrictedAsset.sol', 'RestrictedAsset', ['Demo T-Bill Fund Share', 'dTBILL', registry, issuer]);
  const oracle = await deploy('NavOracle.sol', 'NavOracle', [issuer]);
  const bidBook = await deploy('BidBook.sol', 'BidBook', [usdt, registry, 800, 600]);
  const params = {
    maxLtvBps: 8500,
    liqThresholdBps: 9000,
    haircutBps: 1000,
    rateBps: 800,
    commitFeeBps: 200,
    loanTerm: 900,
    grace: 120,
    maxNavAge: 86400,
  };
  const market = await deploy('StandbyMarket.sol', 'StandbyMarket', [usdt, asset, oracle, bidBook, params]);

  const A = {
    usdt: artifact('Base.t.sol', 'MockUSDT').abi,
    registry: artifact('AllowlistRegistry.sol', 'AllowlistRegistry').abi,
    asset: artifact('RestrictedAsset.sol', 'RestrictedAsset').abi,
    oracle: artifact('NavOracle.sol', 'NavOracle').abi,
    bidBook: artifact('BidBook.sol', 'BidBook').abi,
    market: artifact('StandbyMarket.sol', 'StandbyMarket').abi,
  };
  await write('issuer', bidBook, A.bidBook, 'setMarket', [market]);
  await write('issuer', registry, A.registry, 'setRoles', [market, 4]);
  await write('issuer', registry, A.registry, 'setRoles', [bidBook, 4]);
  await write('issuer', registry, A.registry, 'setRoles', [accounts.borrower.address, 1]);
  await write('issuer', registry, A.registry, 'setRoles', [accounts.buyer1.address, 2]);
  await write('issuer', registry, A.registry, 'setRoles', [accounts.buyer2.address, 2]);
  await write('issuer', oracle, A.oracle, 'setNav', [1_020_000n]);
  await write('issuer', asset, A.asset, 'mint', [accounts.borrower.address, 1000n * 10n ** 18n]);

  const usdtUnit = 10n ** 6n;
  const max = 2n ** 256n - 1n;
  for (const who of ['lender', 'buyer1', 'buyer2', 'borrower'] as const) {
    await write('issuer', usdt, A.usdt, 'mint', [accounts[who].address, 5000n * usdtUnit]);
    await write(who, usdt, A.usdt, 'approve', [bidBook, max]);
    await write(who, usdt, A.usdt, 'approve', [market, max]);
  }
  await write('borrower', asset, A.asset, 'approve', [market, max]);
  await write('buyer1', bidBook, A.bidBook, 'postBid', [600n * usdtUnit, 300, 600]);
  await write('buyer2', bidBook, A.bidBook, 'postBid', [500n * usdtUnit, 500, 600]);
  await write('lender', market, A.market, 'deposit', [1500n * usdtUnit]);

  return {
    rpcUrl,
    client,
    addresses: { usdt, registry, asset, oracle, bidBook, market },
    startBlock,
    accounts,
    keeperKey,
    write,
    async increaseTime(seconds: number) {
      await client.request({ method: 'evm_increaseTime' as never, params: [seconds] as never });
      await client.request({ method: 'evm_mine' as never, params: [] as never });
    },
    stop: () => anvil.kill(),
  };
}
