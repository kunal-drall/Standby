import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ChainReader } from './chain.js';

// Read API, docs/interfaces.md section 6. C0 serves /api/health only; C6 adds
// /api/capacity, /api/bids, /api/loans and /api/events.
export function createApi(chain: ChainReader): Hono {
  const app = new Hono();
  app.use('/api/*', cors({ origin: '*', allowMethods: ['GET'] }));

  app.get('/api/health', async (c) => {
    try {
      const [block, navAt, now] = await Promise.all([
        chain.blockNumber(),
        chain.navUpdatedAt(),
        chain.now(),
      ]);
      return c.json({
        ok: true,
        block: block.toString(),
        navAgeSeconds: navAt === null ? null : Math.max(0, now - navAt),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message.split('\n')[0] : 'unknown error';
      return c.json({ ok: false, error: message }, 503);
    }
  });

  app.notFound((c) => c.json({ ok: false, error: 'not found' }, 404));
  return app;
}
