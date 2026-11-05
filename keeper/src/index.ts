import { serve } from '@hono/node-server';
import { createApi } from './api.js';
import { createClient, createKeeperWallet } from './chain.js';
import { addressesOf, loadConfig } from './config.js';
import { createReader } from './reader.js';
import { createSettler, startLoop } from './settler.js';

const log = (entry: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }));

const config = loadConfig();
const client = createClient(config);
const addresses = addressesOf(config);
const reader = addresses ? createReader(client, addresses, config.START_BLOCK) : null;
const app = createApi(reader);

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  log({ event: 'api_listening', url: `http://localhost:${info.port}/api/health` });
});

const wallet = createKeeperWallet(config);
if (!addresses) {
  log({ event: 'settlement_off', reason: 'contract addresses not configured' });
} else if (!wallet) {
  log({ event: 'settlement_off', reason: 'KEEPER_PK not set' });
} else {
  const settler = createSettler({
    client,
    wallet,
    market: addresses.market,
    maxAttempts: config.MAX_SETTLE_ATTEMPTS,
    log,
  });
  const stop = startLoop(settler, config.POLL_INTERVAL_MS, log);
  log({ event: 'settlement_on', keeper: wallet.account.address, intervalMs: config.POLL_INTERVAL_MS });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      stop();
      process.exit(0);
    });
  }
}
