import { describe, expect, it } from 'vitest';
import { createApi } from './api.js';
import type { ChainReader } from './chain.js';
import { loadConfig } from './config.js';

const reader = (over: Partial<ChainReader> = {}): ChainReader => ({
  blockNumber: async () => 123n,
  navUpdatedAt: async () => 1_000,
  now: async () => 1_090,
  ...over,
});

describe('GET /api/health', () => {
  it('reports block and NAV age', async () => {
    const res = await createApi(reader()).request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, block: '123', navAgeSeconds: 90 });
  });

  it('returns null NAV age before the oracle is deployed', async () => {
    const res = await createApi(reader({ navUpdatedAt: async () => null })).request('/api/health');
    expect((await res.json()).navAgeSeconds).toBeNull();
  });

  it('returns 503 when the RPC fails', async () => {
    const res = await createApi(
      reader({
        blockNumber: async () => {
          throw new Error('timeout');
        },
      }),
    ).request('/api/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: 'timeout' });
  });
});

describe('loadConfig', () => {
  it('applies spec defaults', () => {
    const c = loadConfig({});
    expect(c.WC_CHAIN_ID).toBe(1874);
    expect(c.PORT).toBe(8788);
    expect(c.KEEPER_PK).toBeUndefined();
  });

  it('treats empty address vars as unset and rejects bad ones', () => {
    expect(loadConfig({ MARKET_ADDRESS: '' }).MARKET_ADDRESS).toBeUndefined();
    expect(() => loadConfig({ MARKET_ADDRESS: '0x123' })).toThrow(/MARKET_ADDRESS/);
    expect(() => loadConfig({ WC_CHAIN_ID: '1' })).toThrow(/1874/);
  });
});
