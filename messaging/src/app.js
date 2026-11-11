import express from 'express';
import { webhookSignatureStatus } from './webhook-auth.js';
import { notificationJobs } from './notifications.js';
import { safeError } from './diagnostics.js';

export function createMessagingApp({ config, repository, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (_req, res) => {
    try { await repository.ready(); res.json({ status: 'ready' }); }
    catch (error) {
      logger.error(JSON.stringify({ event: 'messaging_database_unavailable', ...safeError(error) }));
      res.status(503).json({ status: 'unavailable' });
    }
  });

  // HMAC requires the original bytes; do not insert express.json() ahead of this route.
  app.post('/webhooks/shopify', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
    const supportedTopics = ['orders/create', 'fulfillments/create', 'fulfillments/update'];
    const rawTopic = req.get('x-shopify-topic');
    const topic = supportedTopics.includes(rawTopic) ? rawTopic : 'other';
    const reject = (status, reason) => {
      logger.error(JSON.stringify({ event: 'webhook_rejected', topic, reason }));
      return res.status(status).json({ error: reason });
    };
    const signatureStatus = webhookSignatureStatus(req.body, req.get('x-shopify-hmac-sha256'), config.webhookSecret);
    if (signatureStatus !== 'valid') {
      logger.error(JSON.stringify({ event: 'webhook_signature_diagnostic', topic, category: signatureStatus }));
      return reject(401, 'invalid_signature');
    }
    const shop = req.get('x-shopify-shop-domain');
    const deliveryId = req.get('x-shopify-webhook-id');
    if (shop !== config.shop) return reject(403, 'unexpected_shop');
    if (!deliveryId || !/^[a-zA-Z0-9-]{1,128}$/.test(deliveryId)) return reject(400, 'invalid_delivery_id');
    if (topic === 'other') return res.sendStatus(204);
    let jobs;
    try {
      const payload = JSON.parse(req.body.toString('utf8'));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid payload');
      jobs = notificationJobs(topic, payload, config);
    } catch { return reject(400, 'invalid_payload'); }
    try {
      const result = await repository.enqueue({ shop, deliveryId, topic, jobs });
      logger.info?.(JSON.stringify({ event: 'webhook_received', topic, queued: result.queued, duplicate: result.duplicate }));
      return res.status(200).json({ received: true, ...result });
    } catch (error) {
      logger.error(JSON.stringify({ event: 'webhook_persistence_failed', topic, ...safeError(error) }));
      // Shopify must retry when the event could not be durably recorded.
      return res.status(503).json({ error: 'temporarily_unavailable' });
    }
  });
  app.use((error, _req, res, _next) => {
    res.status(error.type === 'entity.too.large' ? 413 : 500).json({ error: 'request_failed' });
  });
  return app;
}
