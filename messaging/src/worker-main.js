import { setTimeout } from 'node:timers/promises';
import { loadEnvironment, readConfig } from './config.js';
import { createPool, MessageRepository } from './repository.js';
import { ShopifyClient } from './shopify.js';
import { TelinfyClient } from './telinfy.js';
import { processOne } from './worker.js';
import { validateLiveSms } from './sms-readiness.js';

loadEnvironment();
const config = readConfig();
const pool = createPool(config);
const repository = new MessageRepository(pool);
const telinfy = new TelinfyClient(config);
const shopify = new ShopifyClient(config);
let stopping = false;
process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });
try {
  await repository.ready();
  const readiness = await shopify.readiness();
  if (!(readiness.accessScopes.includes('read_orders') || readiness.accessScopes.includes('write_orders'))) {
    throw new Error('Shopify order read access is required');
  }
  const readinessWarnings = (await validateLiveSms(config, telinfy)).warnings;
  if (readinessWarnings.length) console.warn(JSON.stringify({ event: 'sms_readiness_warning', codes: readinessWarnings }));
  while (!stopping) {
    try {
      const processed = await processOne({ config, repository, shopify, telinfy });
      if (!processed) await setTimeout(config.pollMs);
    } catch {
      console.error(JSON.stringify({ event: 'worker_iteration_failed' }));
      await setTimeout(config.pollMs);
    }
  }
} finally { await pool.end(); }
