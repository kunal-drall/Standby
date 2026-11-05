import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { Reader } from './reader.js';
import type { SettlerStatus } from './settler.js';

// Read API, docs/interfaces.md section 6. JSON only; amounts are base-unit decimal strings.
// Responses are cached for `cacheMs` so a burst of requests costs one round of RPC reads, and the
// keeper's settlement loop uses its own RPC client, so API traffic cannot starve it.
export function createApi(
  reader: Reader | null,
  opts: { keeperStatus?: () => SettlerStatus | null; cacheMs?: number; now?: () => number } = {},
): Hono {
  const app = new Hono();
  const cacheMs = opts.cacheMs ?? 2_000;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; value: Promise<unknown> }>();
  app.use('/api/*', cors({ origin: '*', allowMethods: ['GET'] }));

  const fail = (c: Context, err: unknown) => {
    const message = err instanceof Error ? (err.message.split('\n')[0] ?? 'error') : 'unknown error';
    return c.json({ ok: false, error: message }, 503);
  };
  const guard = async (c: Context, key: string, run: (r: Reader) => Promise<unknown>) => {
    if (!reader) return c.json({ ok: false, error: 'contracts not deployed or addresses not configured' }, 503);
    let hit = cache.get(key);
    if (!hit || now() - hit.at > cacheMs) {
      hit = { at: now(), value: run(reader) };
      cache.set(key, hit);
      hit.value.catch(() => cache.delete(key)); // never cache a failure
    }
    try {
      return c.json(await hit.value);
    } catch (err) {
      return fail(c, err);
    }
  };

  app.get('/api/health', (c) =>
    guard(c, 'health', async (r) => ({ ...(await r.health()), keeper: opts.keeperStatus?.() ?? null })),
  );
  app.get('/api/capacity', (c) => guard(c, 'capacity', (r) => r.capacity()));
  app.get('/api/bids', (c) => guard(c, 'bids', (r) => r.bids()));
  app.get('/api/loans', (c) => guard(c, 'loans', (r) => r.loans()));

  const fromBlock = z.string().regex(/^\d+$/, 'fromBlock must be a block number').transform(BigInt).optional();
  app.get('/api/events', (c) => {
    const raw = c.req.query('fromBlock');
    const parsed = fromBlock.safeParse(raw);
    if (!parsed.success) return c.json({ ok: false, error: 'fromBlock must be a block number' }, 400);
    return guard(c, `events:${raw ?? ''}`, (r) => r.events(parsed.data));
  });

  app.notFound((c) => c.json({ ok: false, error: 'not found' }, 404));
  return app;
}
