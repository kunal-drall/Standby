import { restrictedAssetAbi, standbyMarketAbi } from '@standby/shared';
import { createWalletClient, http, type Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { whitechainSepolia } from '@standby/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from '../src/api.js';
import { createReader, type Reader } from '../src/reader.js';
import { createSettler } from '../src/settler.js';
import { hasToolchain, startHarness, type Harness } from './harness.js';

const USDT = 10n ** 6n;
const SHARE = 10n ** 18n;

describe.skipIf(!hasToolchain())('keeper against a local anvil deployment', () => {
  let h: Harness;
  let reader: Reader;
  const logs: Record<string, unknown>[] = [];

  beforeAll(async () => {
    h = await startHarness(18_545 + Math.floor(Math.random() * 1000));
    reader = createReader(h.client, h.addresses, h.startBlock);
  }, 60_000);
  afterAll(() => h?.stop());

  const settler = () =>
    createSettler({
      client: h.client,
      wallet: createWalletClient({
        account: privateKeyToAccount(h.keeperKey),
        chain: whitechainSepolia,
        transport: http(h.rpcUrl),
      }),
      market: h.addresses.market,
      maxAttempts: 3,
      log: (e) => logs.push(e),
    });

  it('reads capacity, bids, loans and events in the section 6 shapes', async () => {
    const api = createApi(reader);
    const health = await (await api.request('/api/health')).json();
    expect(health.ok).toBe(true);
    expect(health.navAgeSeconds).toBeGreaterThanOrEqual(0);

    const cap = await reader.capacity();
    expect(cap).toMatchObject({ decimals: 6, committed: String(1100n * USDT), reserved: '0', free: String(1100n * USDT) });
    expect(cap.navs.nav).toBe('1020000');

    const { bids } = await reader.bids();
    expect(bids.map((b) => [b.bidId, b.discountBps, b.amount])).toEqual([
      ['0', 300, String(600n * USDT)],
      ['1', 500, String(500n * USDT)],
    ]);
    expect((await reader.loans()).loans).toEqual([]);

    const { events } = await reader.events();
    const names = new Set(events.map((e) => e.event));
    for (const n of ['RolesSet', 'NavPosted', 'BidPosted', 'Deposited', 'MarketSet']) expect(names).toContain(n);
    expect(events[0]?.explorerUrl).toMatch(/^https:\/\/explorer\.testnet\.whitechain\.io\/tx\/0x/);
  });

  it('settles a loan once it passes maturity plus grace, and only then', async () => {
    await h.write('borrower', h.addresses.market, standbyMarketAbi as Abi, 'openLoan', [1000n * SHARE, 867n * USDT]);
    const s = settler();
    let { loans } = await reader.loans();
    expect(loans[0]).toMatchObject({ loanId: '0', state: 'Open', settleable: false, principal: String(867n * USDT) });
    expect(await s.tick()).toEqual([]);

    await h.increaseTime(900 + 120 + 5);
    loans = (await reader.loans()).loans;
    expect(loans[0]?.settleable).toBe(true);

    expect(await s.tick()).toEqual([0n]);
    expect(logs.find((l) => l.event === 'settled')).toMatchObject({ loanId: '0' });
    loans = (await reader.loans()).loans;
    expect(loans[0]).toMatchObject({ state: 'Settled', settleable: false, due: '0' });
    expect(await s.tick()).toEqual([]);

    const cap = await reader.capacity();
    expect(BigInt(cap.reserved)).toBe(0n);
    expect(BigInt(cap.committed)).toBeLessThan(1100n * USDT); // buyers paid for the shares
    const names = (await reader.events()).events.map((e) => e.event);
    expect(names).toContain('LoanSettled');
    expect(names).toContain('Filled');
  });

  it('gives up on a loan after three failed settlements', async () => {
    await h.write('issuer', h.addresses.oracle, (await import('@standby/shared')).navOracleAbi as Abi, 'setNav', [1_020_000n]);
    await h.write('borrower', h.addresses.market, standbyMarketAbi as Abi, 'openLoan', [10n * SHARE, 5n * USDT]);
    await h.increaseTime(900 + 120 + 5);
    await h.write('issuer', h.addresses.asset, restrictedAssetAbi as Abi, 'pause', []); // settle now reverts
    const s = settler();
    for (let i = 0; i < 4; i++) await s.tick();
    expect(s.abandoned()).toEqual([1n]);
    expect(logs.filter((l) => l.loanId === '1' && l.event === 'settle_failed')).toHaveLength(2);
    expect(logs.find((l) => l.loanId === '1' && l.event === 'gave_up')).toBeTruthy();
  });
});
