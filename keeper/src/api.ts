import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import type { Reader } from './reader.js';

// Read API, docs/interfaces.md section 6. JSON only; amounts are base-unit decimal strings.
export function createApi(reader: Reader | null): Hono {
  const app = new Hono();
  app.use('/api/*', cors({ origin: '*', allowMethods: ['GET'] }));

  const fail = (c: Context, err: unknown) => {
    const message = err instanceof Error ? (err.message.split('\n')[0] ?? 'error') : 'unknown error';
    return c.json({ ok: false, error: message }, 503);
  };
  const guard = async (c: Context, run: (r: Reader) => Promise<unknown>) => {
    if (!reader) return c.json({ ok: false, error: 'contracts not deployed or addresses not configured' }, 503);
    try {
      return c.json(await run(reader));
    } catch (err) {
      return fail(c, err);
    }
  };

  app.get('/api/health', (c) => guard(c, (r) => r.health()));
  app.get('/api/capacity', (c) => guard(c, (r) => r.capacity()));
  app.get('/api/bids', (c) => guard(c, (r) => r.bids()));
  app.get('/api/loans', (c) => guard(c, (r) => r.loans()));

  const fromBlock = z.string().regex(/^\d+$/, 'fromBlock must be a block number').transform(BigInt).optional();
  app.get('/api/events', (c) => {
    const parsed = fromBlock.safeParse(c.req.query('fromBlock'));
    if (!parsed.success) return c.json({ ok: false, error: 'fromBlock must be a block number' }, 400);
    return guard(c, (r) => r.events(parsed.data));
  });

  app.notFound((c) => c.json({ ok: false, error: 'not found' }, 404));
  return app;
}
