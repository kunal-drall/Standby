import { serve } from '@hono/node-server';
import { createApi } from './api.js';
import { createChainReader, createClient } from './chain.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const client = createClient(config);
const app = createApi(createChainReader(client, config.ORACLE_ADDRESS));

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`read API on http://localhost:${info.port}/api/health`);
});

// TODO(C6): poll open loans every POLL_INTERVAL_MS, settle any isSettleable (max three retries),
// log each settlement with its explorer link. Needs KEEPER_PK and MARKET_ADDRESS.
if (!config.KEEPER_PK || !config.MARKET_ADDRESS) {
  console.log('settlement loop off: KEEPER_PK or MARKET_ADDRESS not set');
}
