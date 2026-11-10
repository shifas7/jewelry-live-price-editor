import { readConfig } from './config.js';
import { createStorage } from './storage.js';
import { createMessagingApp } from './app.js';
import { ShopifyClient } from './shopify.js';
import { TelinfyClient } from './telinfy.js';
import { processOne } from './worker.js';
import { validateLiveSms } from './sms-readiness.js';
import { safeError } from './diagnostics.js';

// A webhook wakes the worker immediately. The longer fallback handles retries,
// missed wakeups and restarts while allowing a staging database to scale down.
export function createWakeSignal() {
  let pending = false;
  let waiter;
  return {
    wake() { pending = true; waiter?.(); },
    async wait(ms) {
      if (pending) { pending = false; return; }
      await new Promise(resolve => {
        const timer = setTimeout(finish, ms);
        function finish() { clearTimeout(timer); waiter = undefined; pending = false; resolve(); }
        waiter = finish;
      });
    },
  };
}

export function createEmbeddedMessaging({ env = process.env, logger = console,
  storageFactory = createStorage, shopifyFactory = c => new ShopifyClient(c),
  telinfyFactory = c => new TelinfyClient(c), retryMs = 60000 } = {}) {
  const enabled = env.MESSAGING_EMBEDDED_ENABLED === 'true';
  let handler;
  let storage;
  let stopping = false;
  let running;
  const signal = createWakeSignal();
  const middleware = (req, res, next) => {
    if (!enabled) return next();
    if (!handler) return res.status(503).json({ error: 'messaging_unavailable' });
    return handler(req, res, next);
  };

  async function run() {
    if (!enabled) return;
    try {
      const config = readConfig({ ...env, WORKER_POLL_MS: env.WORKER_POLL_MS || '600000' });
      if (env.MESSAGING_AUTO_MIGRATE && !['true', 'false'].includes(env.MESSAGING_AUTO_MIGRATE)) throw new Error('Invalid migration setting');
      storage = storageFactory(config, logger);
      const repository = storage.repository;
      const enqueue = repository.enqueue.bind(repository);
      repository.enqueue = async input => { const result = await enqueue(input); if (result.queued) signal.wake(); return result; };
      const shopify = shopifyFactory(config);
      const telinfy = telinfyFactory(config);
      handler = createMessagingApp({ config, repository, logger });
      let initialized = false;
      while (!stopping) {
        let stage = 'worker';
        try {
          if (!initialized) {
            stage = 'database';
            if (env.MESSAGING_AUTO_MIGRATE === 'true') await storage.initialize();
            await repository.ready();
            stage = 'shopify';
            const readiness = await shopify.readiness();
            if (!(readiness.accessScopes.includes('read_orders') || readiness.accessScopes.includes('write_orders'))) throw new Error('Order access missing');
            stage = 'provider';
            const warnings = (await validateLiveSms(config, telinfy)).warnings;
            if (warnings.length) logger.warn(JSON.stringify({ event: 'sms_readiness_warning', codes: warnings }));
            initialized = true;
            logger.info(JSON.stringify({ event: 'embedded_messaging_ready', dryRun: config.dryRun }));
          }
          stage = 'worker';
          const processed = await processOne({ config, repository, shopify, telinfy, logger });
          if (!processed) await signal.wait(config.pollMs);
        } catch (error) {
          logger.error(JSON.stringify({ event: 'embedded_messaging_retry', stage, ...safeError(error) }));
          initialized = false;
          await signal.wait(retryMs);
        }
      }
    } catch {
      // Misconfiguration must not prevent the price service from starting.
      logger.error(JSON.stringify({ event: 'embedded_messaging_configuration_failed' }));
    } finally {
      handler = undefined;
      if (storage) await storage.close().catch(() => {});
    }
  }
  return {
    enabled, middleware,
    start() { if (!running) running = run(); return running; },
    async stop() { stopping = true; signal.wake(); if (running) await running; },
  };
}
