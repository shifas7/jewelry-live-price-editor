import express from 'express';
import { verifyWebhook } from './webhook-auth.js';
import { notificationJobs } from './notifications.js';

export function createMessagingApp({ config, repository, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (_req, res) => {
    try { await repository.ready(); res.json({ status: 'ready' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });

  // HMAC requires the original bytes; do not insert express.json() ahead of this route.
  app.post('/webhooks/shopify', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
    if (!verifyWebhook(req.body, req.get('x-shopify-hmac-sha256'), config.webhookSecret)) {
      return res.status(401).json({ error: 'invalid_signature' });
    }
    const shop = req.get('x-shopify-shop-domain');
    const topic = req.get('x-shopify-topic');
    const deliveryId = req.get('x-shopify-webhook-id');
    if (shop !== config.shop) return res.status(403).json({ error: 'unexpected_shop' });
    if (!deliveryId || !/^[a-zA-Z0-9-]{1,128}$/.test(deliveryId)) return res.status(400).json({ error: 'invalid_delivery_id' });
    if (!['orders/create', 'fulfillments/create', 'fulfillments/update'].includes(topic)) return res.sendStatus(204);
    let jobs;
    try {
      const payload = JSON.parse(req.body.toString('utf8'));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid payload');
      jobs = notificationJobs(topic, payload, config);
    } catch { return res.status(400).json({ error: 'invalid_payload' }); }
    try {
      const result = await repository.enqueue({ shop, deliveryId, topic, jobs });
      return res.status(200).json({ received: true, ...result });
    } catch {
      logger.error(JSON.stringify({ event: 'webhook_persistence_failed', topic }));
      // Shopify must retry when the event could not be durably recorded.
      return res.status(503).json({ error: 'temporarily_unavailable' });
    }
  });
  app.use((error, _req, res, _next) => {
    res.status(error.type === 'entity.too.large' ? 413 : 500).json({ error: 'request_failed' });
  });
  return app;
}
