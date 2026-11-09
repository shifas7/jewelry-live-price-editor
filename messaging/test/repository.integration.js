import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createPool, migrate, MessageRepository } from '../src/repository.js';
import { processOne } from '../src/worker.js';
import { IntegrationError } from '../src/errors.js';
import { ORDER_TEMPLATE, TRACKING_TEMPLATE } from '../src/templates.js';
import { createHmac } from 'node:crypto';
import { createApp } from '../../server/config/app.js';
import { createEmbeddedMessaging } from '../src/embedded.js';

const url = new URL(process.env.TEST_DATABASE_URL || 'postgresql://invalid/invalid');
if (process.env.BHIMA_TEMP_PG !== '1' || url.hostname !== '127.0.0.1' || !/^\/bhima_test_[a-f0-9]+$/.test(url.pathname)) {
  throw new Error('Integration tests require the isolated PostgreSQL test runner');
}
const pool = createPool({ databaseUrl: url.toString() });
const repository = new MessageRepository(pool);
before(async () => { await migrate(pool); await migrate(pool); });
after(async () => pool.end());
beforeEach(async () => { await pool.query('TRUNCATE bhima_messages, bhima_webhook_receipts RESTART IDENTITY'); });
const config = { shop: 'example.myshopify.com', orderSms: true, trackingSms: true, dryRun: false,
  allowTestOrders: false, recipientAllowlist: [], leaseSeconds: 120, maxAttempts: 3, sender: 'BIMJWL',
  orderTemplateId: '1777179214792762931', trackingTemplateId: '1777179214853851012' };
const order = { id: 'gid://shopify/Order/123', name: '#1001', phone: '+919876543210', test: false,
  cancelledAt: null, shippingAddress: { firstName: 'Test', lastName: 'Customer' } };
const job = suffix => ({ kind: 'order_confirmation', dedupeKey: `test-${suffix}`, payload: { orderId: order.id } });
const logger = { info() {} };
const shopify = { order: async () => order };
function provider(sendSms) {
  return {
    templates: async () => ({ templates: [
      { template_id: config.orderTemplateId, template_content: ORDER_TEMPLATE, status: 1, headers: ['BIMJWL'] },
      { template_id: config.trackingTemplateId, template_content: TRACKING_TEMPLATE, status: 1, headers: ['BIMJWL'] },
    ] }),
    wallet: async () => ({ wallet: 10, credit_expiry: '2099-12-31' }), sendSms,
  };
}
async function enqueue(jobs, deliveryId = 'delivery-1') {
  return repository.enqueue({ shop: config.shop, deliveryId, topic: 'orders/create', jobs });
}
async function messages() { return (await pool.query('SELECT * FROM bhima_messages ORDER BY id')).rows; }

test('embedded webhook keeps signed raw bytes and wakes its worker inside the price app', async () => {
  const env = { MESSAGING_EMBEDDED_ENABLED: 'true', DATABASE_URL: url.toString(), SHOPIFY_SHOP: 'example.myshopify.com',
    SHOPIFY_ADMIN_ACCESS_TOKEN: 'fake-token', SHOPIFY_WEBHOOK_SECRET: 'test-secret',
    FEATURE_ORDER_SMS: 'true', MESSAGING_DRY_RUN: 'true', WORKER_POLL_MS: '600000' };
  const embedded = createEmbeddedMessaging({ env, logger: { info() {}, warn() {}, error() {} },
    shopifyFactory: () => ({ readiness: async () => ({ accessScopes: ['read_orders'] }), order: async () => order }),
    telinfyFactory: () => ({ sendSms: async () => assert.fail('dry-run must not send SMS') }) });
  const app = createApp({ beforeJson: app => app.use('/messaging', embedded.middleware) });
  app.get('/price-test', (_req, res) => res.json({ priceService: 'ok' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  embedded.start();
  try {
    const body = '{ "id": 123 }\n';
    const headers = { 'Content-Type': 'application/json', 'x-shopify-shop-domain': env.SHOPIFY_SHOP,
      'x-shopify-topic': 'orders/create', 'x-shopify-webhook-id': 'embedded-test',
      'x-shopify-hmac-sha256': createHmac('sha256', env.SHOPIFY_WEBHOOK_SECRET).update(body).digest('base64') };
    const response = await fetch(`${base}/messaging/webhooks/shopify`, { method: 'POST', headers, body });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).queued, 1);
    const invalid = await fetch(`${base}/messaging/webhooks/shopify`, { method: 'POST', headers, body: '{"id":123}' });
    assert.equal(invalid.status, 401);
    assert.deepEqual(await (await fetch(`${base}/price-test`)).json(), { priceService: 'ok' });
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [record] = await messages();
      if (record?.status === 'dry_run') break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const records = await messages();
    assert.equal(records.length, 1);
    assert.equal(records[0].status, 'dry_run');
  } finally {
    await embedded.stop();
    await new Promise(resolve => server.close(resolve));
  }
});

test('disabled or misconfigured messaging leaves the price application available', async () => {
  for (const env of [{}, { MESSAGING_EMBEDDED_ENABLED: 'true' }]) {
    const embedded = createEmbeddedMessaging({ env, logger: { info() {}, warn() {}, error() {} } });
    const app = createApp({ beforeJson: app => app.use('/messaging', embedded.middleware) });
    app.get('/price-test', (_req, res) => res.json({ priceService: 'ok' }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    embedded.start();
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      assert.equal((await fetch(`${base}/price-test`)).status, 200);
      assert.equal((await fetch(`${base}/messaging/webhooks/shopify`, { method: 'POST' })).status, embedded.enabled ? 503 : 404);
    } finally { await embedded.stop(); await new Promise(resolve => server.close(resolve)); }
  }
});

test('concurrent webhook retries and different deliveries create one logical message', async () => {
  await Promise.all(Array.from({ length: 15 }, (_, index) => enqueue([job('one')], `delivery-${index % 3}`)));
  assert.equal((await messages()).length, 1);
  assert.equal((await pool.query('SELECT count(*) FROM bhima_webhook_receipts')).rows[0].count, '3');
});

test('concurrent workers claim different messages and no message twice', async () => {
  await enqueue([job('one'), job('two'), job('three')]);
  const claimed = await Promise.all(Array.from({ length: 8 }, () => repository.claim()));
  const ids = claimed.filter(Boolean).map(item => item.id);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3);
});

test('invalid job rolls back both receipt and the entire batch', async () => {
  await assert.rejects(enqueue([job('valid'), { ...job('bad'), kind: 'invalid_kind' }]));
  assert.equal((await messages()).length, 0);
  assert.equal((await pool.query('SELECT count(*) FROM bhima_webhook_receipts')).rows[0].count, '0');
});

test('crashed processing becomes uncertain and is never automatically claimed again', async () => {
  await enqueue([job('one')]);
  await repository.claim();
  await pool.query("UPDATE bhima_messages SET started_at = now() - interval '5 minutes'");
  await repository.recoverExpired(120);
  assert.equal((await messages())[0].status, 'uncertain');
  assert.equal(await repository.claim(), null);
});

test('dry-run sends no SMS and durable records contain only a masked recipient', async () => {
  await enqueue([job('one')]);
  let sent = 0;
  await processOne({ config: { ...config, dryRun: true }, repository, shopify, telinfy: provider(async () => { sent++; }), logger });
  const [record] = await messages();
  assert.equal(sent, 0);
  assert.equal(record.status, 'dry_run');
  assert.equal(record.recipient_last4, '3210');
  assert.doesNotMatch(JSON.stringify(record), /9876543210|Test Customer/);
});

test('accepted delivery persists provider correlation without claiming it was delivered', async () => {
  await enqueue([job('one')]);
  let sent = 0;
  await processOne({ config, repository, shopify, telinfy: provider(async () => { sent++; return { providerIds: ['fake-message-id'] }; }), logger });
  const [record] = await messages();
  assert.equal(sent, 1);
  assert.equal(record.status, 'accepted');
  assert.deepEqual(record.provider_ids, ['fake-message-id']);
  assert.equal(await processOne({ config, repository, shopify, telinfy: {}, logger }), false);
});

test('unknown send result is held for reconciliation instead of being sent twice', async () => {
  await enqueue([job('one')]);
  let sent = 0;
  const telinfy = provider(async () => { sent++; throw new IntegrationError('telinfy_connection_unknown', { disposition: 'uncertain' }); });
  await processOne({ config, repository, shopify, telinfy, logger });
  assert.equal((await messages())[0].status, 'uncertain');
  assert.equal(await processOne({ config, repository, shopify, telinfy, logger }), false);
  assert.equal(sent, 1);
});

test('a persistence error after a send leaves the lease intact for conservative recovery', async () => {
  await enqueue([job('one')]);
  const broken = { claim: repository.claim.bind(repository), recoverExpired: repository.recoverExpired.bind(repository),
    finish: async () => { throw new Error('temporary persistence failure'); } };
  await assert.rejects(processOne({ config, repository: broken, shopify, telinfy: provider(async () => ({ providerIds: ['fake-message-id'] })), logger }));
  assert.equal((await messages())[0].status, 'processing');
  assert.equal(await repository.claim(), null);
});

test('numeric DLT mismatch and recipient restrictions stop SMS before the provider send', async () => {
  const trackingJob = { ...job('tracking'), kind: 'tracking', payload: { orderId: order.id, carrier: 'Test Carrier', trackingNumber: 'AWB123' } };
  await enqueue([trackingJob]);
  let sent = 0;
  const telinfy = provider(async () => { sent++; return { providerIds: [] }; });
  await processOne({ config, repository, shopify, telinfy, logger });
  assert.equal((await messages())[0].error_code, 'numeric_template_variable_required');
  await enqueue([job('not-allowlisted')], 'delivery-2');
  await processOne({ config: { ...config, recipientAllowlist: ['8765432109'] }, repository, shopify, telinfy, logger });
  assert.equal((await messages())[1].error_code, 'recipient_not_allowlisted');
  assert.equal(sent, 0);
});

test('safe transient failures retry only up to the configured attempt limit', async () => {
  await enqueue([job('one')]);
  const rateLimited = provider(async () => { throw new IntegrationError('telinfy_rate_limited', { disposition: 'retry', retryAfterSeconds: 1 }); });
  for (let attempt = 1; attempt <= 3; attempt++) {
    await processOne({ config, repository, shopify, telinfy: rateLimited, logger });
    const [record] = await messages();
    assert.equal(record.attempts, attempt);
    assert.equal(record.status, attempt < 3 ? 'pending' : 'failed');
    await pool.query("UPDATE bhima_messages SET available_at = now() - interval '1 second' WHERE status = 'pending'");
  }
  assert.equal(await repository.claim(), null);
});
