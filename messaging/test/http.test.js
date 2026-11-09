import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createMessagingApp } from '../src/app.js';

async function withApp(callback, overrides = {}) {
  const received = [];
  const repository = {
    ready: async () => {},
    enqueue: async item => { received.push(item); return { queued: item.jobs.length, duplicate: false }; },
    ...overrides,
  };
  const config = { shop: 'example.myshopify.com', webhookSecret: 'test-secret', orderSms: true, trackingSms: true };
  const app = createMessagingApp({ config, repository, logger: { error() {} } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`, received); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

function headers(body, overrides = {}) {
  return { 'Content-Type': 'application/json', 'x-shopify-shop-domain': 'example.myshopify.com',
    'x-shopify-topic': 'orders/create', 'x-shopify-webhook-id': 'test-delivery-1',
    'x-shopify-hmac-sha256': createHmac('sha256', 'test-secret').update(body).digest('base64'), ...overrides };
}

test('webhooks verify raw bytes before persistence and store only necessary identifiers', async () => {
  await withApp(async (url, received) => {
    const body = '{ "id": 123, "phone": "9876543210", "email": "private@example.invalid" }\n';
    const response = await fetch(`${url}/webhooks/shopify`, { method: 'POST', body, headers: headers(body) });
    assert.equal(response.status, 200);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0].jobs[0].payload, { orderId: 'gid://shopify/Order/123' });
    assert.doesNotMatch(JSON.stringify(received), /9876543210|private@/);
    const invalid = await fetch(`${url}/webhooks/shopify`, { method: 'POST', body: '{"id":123}', headers: headers(body) });
    assert.equal(invalid.status, 401);
    assert.equal(received.length, 1);
    const wrongShop = await fetch(`${url}/webhooks/shopify`, { method: 'POST', body, headers: headers(body, { 'x-shopify-shop-domain': 'other.myshopify.com' }) });
    assert.equal(wrongShop.status, 403);
  });
});

test('database failure returns 503 so Shopify can retry rather than lose an event', async () => {
  await withApp(async url => {
    const body = '{"id":123}';
    const response = await fetch(`${url}/webhooks/shopify`, { method: 'POST', body, headers: headers(body) });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'temporarily_unavailable' });
  }, { enqueue: async () => { throw new Error('database secret must not leak'); } });
});

test('no public SMS relay or premature OTP login endpoint is exposed', async () => {
  await withApp(async url => {
    for (const path of ['/api/sms/send', '/api/otp/request', '/api/otp/verify']) {
      assert.equal((await fetch(`${url}${path}`, { method: 'POST' })).status, 404);
    }
  });
});
