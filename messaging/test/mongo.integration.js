import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createMongoStorage } from '../src/mongo-repository.js';
import { createEmbeddedMessaging } from '../src/embedded.js';
import { createApp } from '../../server/config/app.js';
import utilsRoutes from '../../server/routes/utils.js';
import { processOne } from '../src/worker.js';
import { IntegrationError } from '../src/errors.js';
import { TelinfyClient } from '../src/telinfy.js';

const uri = process.env.TEST_MONGODB_URI || '';
const database = process.env.TEST_MONGODB_DATABASE || '';
const prefix = process.env.TEST_MONGODB_PREFIX || '';
const local = process.env.BHIMA_TEMP_MONGO === '1' && /^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri) && /^bhima_test_[a-f0-9]+$/.test(database);
let atlas = false;
try { atlas = process.env.BHIMA_ATLAS_TEST === '1' && new URL(uri).protocol === 'mongodb+srv:' && new URL(uri).hostname.endsWith('.mongodb.net') && database === 'bhima_messaging_staging'; } catch {}
if (!(local || atlas) || !/^bhima_test_[a-f0-9]{16}$/.test(prefix)) throw new Error('Mongo tests require isolated test collections');
const config = { databaseUrl: uri, mongoDatabase: database, shop: 'example.myshopify.com', orderSms: true,
  trackingSms: false, dryRun: true, sender: 'BIMJWL', allowTestOrders: false,
  recipientAllowlist: [], leaseSeconds: 120, maxAttempts: 3 };
const storage = createMongoStorage(config, { collectionPrefix: prefix });
const repository = storage.repository;
const logger = { info() {}, warn() {}, error() {} };
const order = { id: 'gid://shopify/Order/123', name: 'TEST1001', phone: '+919876543210', test: false,
  cancelledAt: null, shippingAddress: { firstName: 'Test', lastName: 'Customer' } };
const shopify = { order: async () => order };
const job = suffix => ({ kind: 'order_confirmation', dedupeKey: `test-${suffix}`, payload: { orderId: order.id } });
const enqueue = (jobs, deliveryId = 'delivery-1') => repository.enqueue({ shop: config.shop, deliveryId, topic: 'orders/create', jobs });
let collectionsCreated = false;
before(async () => {
  const names = await Promise.all([repository.messages.collectionName, repository.receipts.collectionName]
    .map(name => storage.db.listCollections({ name }).toArray()));
  if (names.some(items => items.length)) throw new Error('Test collections already exist; refusing to use them');
  await storage.initialize(); collectionsCreated = true; await storage.initialize(); await repository.ready();
});
beforeEach(async () => { await repository.messages.deleteMany({}); await repository.receipts.deleteMany({}); });
after(async () => {
  if (collectionsCreated) { await repository.messages.drop(); await repository.receipts.drop(); }
  await storage.close();
});

test('concurrent webhook deliveries deduplicate receipts and logical messages', async () => {
  await Promise.all(Array.from({ length: 15 }, (_, index) => enqueue([job('one')], `delivery-${index % 3}`)));
  assert.equal(await repository.messages.countDocuments({}), 1);
  assert.equal(await repository.receipts.countDocuments({}), 3);
});

test('workers claim different messages once and invalid batches persist nothing', async () => {
  await assert.rejects(enqueue([job('valid'), { ...job('bad'), kind: 'invalid' }]));
  assert.equal(await repository.receipts.countDocuments({}), 0);
  assert.equal(await repository.messages.countDocuments({}), 0);
  await enqueue([job('one'), job('two'), job('three')]);
  const claimed = (await Promise.all(Array.from({ length: 8 }, () => repository.claim()))).filter(Boolean);
  assert.equal(claimed.length, 3);
  assert.equal(new Set(claimed.map(item => item.id)).size, 3);
});

test('unknown results and abandoned leases are held without automatic resends', async () => {
  await enqueue([job('one')]);
  let sends = 0;
  const telinfy = { sendSms: async () => { sends++; throw new IntegrationError('unknown', { disposition: 'uncertain' }); } };
  // A fake provider makes the preflight pass, while the actual repository is MongoDB.
  const { ORDER_TEMPLATE } = await import('../src/templates.js');
  Object.assign(telinfy, { templates: async () => ({ templates: [{ template_id: '1777179214792762931', template_content: ORDER_TEMPLATE, status: 1, headers: ['BIMJWL'] }] }),
    wallet: async () => ({ wallet: 1, credit_expiry: '2099-01-01' }) });
  const live = { ...config, dryRun: false, orderTemplateId: '1777179214792762931' };
  await processOne({ config: live, repository, shopify, telinfy, logger });
  assert.equal((await repository.messages.findOne({ _id: 'test-one' })).status, 'uncertain');
  assert.equal(await repository.claim(), null);
  assert.equal(sends, 1);
  await enqueue([job('two')], 'delivery-2');
  await repository.claim();
  await repository.messages.updateOne({ _id: 'test-two' }, { $set: { started_at: new Date(Date.now() - 300000) } });
  await repository.recoverExpired(120);
  assert.equal((await repository.messages.findOne({ _id: 'test-two' })).status, 'uncertain');
  assert.equal(await repository.claim(), null);
});

test('embedded price app accepts signed raw webhook and wakes Mongo worker in dry-run', async () => {
  const env = { MESSAGING_EMBEDDED_ENABLED: 'true', MONGODB_URI: uri, MONGODB_DATABASE: database,
    SHOPIFY_SHOP: config.shop, SHOPIFY_ADMIN_ACCESS_TOKEN: 'fake-token', SHOPIFY_WEBHOOK_SECRET: 'test-secret',
    FEATURE_ORDER_SMS: 'true', MESSAGING_DRY_RUN: 'true', WORKER_POLL_MS: '600000' };
  const embedded = createEmbeddedMessaging({ env, logger,
    storageFactory: config => createMongoStorage(config, { collectionPrefix: prefix }),
    shopifyFactory: () => ({ readiness: async () => ({ accessScopes: ['read_orders'] }), order: async () => order }),
    telinfyFactory: () => ({ sendSms: async () => assert.fail('dry-run must not send SMS') }) });
  const app = createApp({ beforeJson: app => app.use('/messaging', embedded.middleware) });
  app.use('/api', utilsRoutes);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  embedded.start();
  try {
    const body = '{ "id": 123 }\n';
    const headers = { 'Content-Type': 'application/json', 'x-shopify-shop-domain': config.shop,
      'x-shopify-topic': 'orders/create', 'x-shopify-webhook-id': 'embedded-test',
      'x-shopify-hmac-sha256': createHmac('sha256', env.SHOPIFY_WEBHOOK_SECRET).update(body).digest('base64') };
    const response = await fetch(`${base}/messaging/webhooks/shopify`, { method: 'POST', body, headers });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).queued, 1);
    assert.equal((await fetch(`${base}/messaging/webhooks/shopify`, { method: 'POST', body: '{"id":123}', headers })).status, 401);
    const priceHealth = await fetch(`${base}/api/health`);
    assert.equal(priceHealth.status, 200);
    assert.equal((await priceHealth.json()).success, true);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !(await repository.messages.findOne({ status: 'dry_run' }))) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.equal(await repository.messages.countDocuments({ status: 'dry_run' }), 1);
  } finally { await embedded.stop(); await new Promise(resolve => server.close(resolve)); }
});

for (const [scenario, expectedStatus] of [['success', 'accepted'], ['timeout-after-submit', 'uncertain']]) {
  test(`embedded Atlas worker with local Telinfy simulation: ${scenario}`, { skip: !process.env.TELINFY_SIMULATION_URL }, async () => {
    const sim = process.env.TELINFY_SIMULATION_URL;
    assert.match(sim, /^http:\/\/127\.0\.0\.1:\d+\/telinfy$/);
    const reset = await fetch(`${sim}/__test/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario }) });
    assert.equal(reset.status, 200);
    const env = { MESSAGING_EMBEDDED_ENABLED: 'true', MONGODB_URI: uri, MONGODB_DATABASE: database,
      SHOPIFY_SHOP: config.shop, SHOPIFY_ADMIN_ACCESS_TOKEN: 'fake-token', SHOPIFY_WEBHOOK_SECRET: 'test-secret',
      TELINFY_API_KEY: 'fake-test-key', FEATURE_ORDER_SMS: 'true', MESSAGING_DRY_RUN: 'false', WORKER_POLL_MS: '600000',
      SMS_CONFIRMED_STALE_CREDIT_EXPIRY: '2026-10-08 17:57:18' };
    const embedded = createEmbeddedMessaging({ env, logger,
      storageFactory: config => createMongoStorage(config, { collectionPrefix: prefix }),
      shopifyFactory: () => ({ readiness: async () => ({ accessScopes: ['read_orders'] }), order: async () => order }),
      telinfyFactory: config => new TelinfyClient({ ...config, telinfyBaseUrl: `${sim}/unified/developer`, timeoutMs: 1000 }) });
    const app = createApp({ beforeJson: app => app.use('/messaging', embedded.middleware) });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    embedded.start();
    try {
      const body = '{ "id": 123 }\n';
      const headers = { 'Content-Type': 'application/json', 'x-shopify-shop-domain': config.shop,
        'x-shopify-topic': 'orders/create', 'x-shopify-webhook-id': 'embedded-simulation',
        'x-shopify-hmac-sha256': createHmac('sha256', env.SHOPIFY_WEBHOOK_SECRET).update(body).digest('base64') };
      const response = await fetch(`${base}/messaging/webhooks/shopify`, { method: 'POST', headers, body });
      assert.equal(response.status, 200);
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && !(await repository.messages.findOne({ status: expectedStatus }))) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(await repository.messages.countDocuments({ status: expectedStatus }), 1);
      const state = await (await fetch(`${sim}/__test/state`)).json();
      assert.equal(state.calls.length, 1);
    } finally { await embedded.stop(); await new Promise(resolve => server.close(resolve)); }
  });
}
