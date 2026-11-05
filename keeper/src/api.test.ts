import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import { addressesOf, loadConfig } from './config.js';
import type { Reader } from './reader.js';

const stub = (over: Partial<Reader> = {}): Reader => ({
  health: async () => ({ ok: true, block: '123', navAgeSeconds: 90 }),
  capacity: async () => ({
    decimals: 6,
    committed: '1100000000',
    reserved: '0',
    free: '1100000000',
    freeUntil: 1_000,
    unlocking: [],
    navs: { nav: '1020000', updatedAt: 1 },
  }),
  bids: async () => ({ decimals: 6, bids: [] }),
  loans: async () => ({ decimals: 6, loans: [] }),
  events: async (from) => ({ decimals: 6, fromBlock: String(from ?? 0n), toBlock: '10', events: [] }),
  ...over,
});

describe('read API', () => {
  it('serves health', async () => {
    const res = await createApi(stub()).request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, block: '123', navAgeSeconds: 90 });
  });

  it('serves capacity, bids and loans with decimals at the top level', async () => {
    const api = createApi(stub());
    for (const path of ['/api/capacity', '/api/bids', '/api/loans']) {
      const res = await api.request(path);
      expect(res.status).toBe(200);
      expect((await res.json()).decimals).toBe(6);
    }
  });

  it('validates fromBlock', async () => {
    const api = createApi(stub());
    expect((await api.request('/api/events?fromBlock=abc')).status).toBe(400);
    const res = await api.request('/api/events?fromBlock=7');
    expect((await res.json()).fromBlock).toBe('7');
  });

  it('returns 503 when the chain read fails or nothing is deployed', async () => {
    const failing = createApi(
      stub({
        health: async () => {
          throw new Error('timeout\nmore detail');
        },
      }),
    );
    const res = await failing.request('/api/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'timeout' });
    expect((await createApi(null).request('/api/loans')).status).toBe(503);
  });

  it('answers 404 as JSON', async () => {
    const res = await createApi(stub()).request('/nope');
    expect(res.status).toBe(404);
  });
});

describe('loadConfig', () => {
  it('applies spec defaults', () => {
    const c = loadConfig({});
    expect(c.WC_CHAIN_ID).toBe(1874);
    expect(c.PORT).toBe(8788);
    expect(c.POLL_INTERVAL_MS).toBe(15_000);
    expect(c.MAX_SETTLE_ATTEMPTS).toBe(3);
    expect(c.KEEPER_PK).toBeUndefined();
    expect(c.USDT_ADDRESS).toBe('0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7');
  });

  it('needs every address before reading the chain', () => {
    expect(addressesOf(loadConfig({}))).toBeNull();
    const a = '0x' + '11'.repeat(20);
    const full = loadConfig({
      REGISTRY_ADDRESS: a,
      ASSET_ADDRESS: a,
      ORACLE_ADDRESS: a,
      BIDBOOK_ADDRESS: a,
      MARKET_ADDRESS: a,
    });
    expect(addressesOf(full)?.market).toBe(a);
  });

  it('rejects bad values', () => {
    expect(() => loadConfig({ MARKET_ADDRESS: '0x123' })).toThrow(/MARKET_ADDRESS/);
    expect(() => loadConfig({ WC_CHAIN_ID: '1' })).toThrow(/1874/);
    expect(() => loadConfig({ KEEPER_PK: '0x12' })).toThrow(/KEEPER_PK/);
  });
});
