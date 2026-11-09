import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readConfig } from '../src/config.js';
import { verifyWebhook } from '../src/webhook-auth.js';
import { notificationJobs } from '../src/notifications.js';
import { indianMobile, orderRecipient } from '../src/phone.js';
import { orderMessage, trackingMessage } from '../src/templates.js';
import { creditExpiryTime } from '../src/sms-readiness.js';

test('defaults prevent sends, keep DLT IDs as strings, and reject secret-forwarding destinations', () => {
  const config = readConfig({}, { requireDatabase: false });
  assert.equal(config.dryRun, true);
  assert.equal(config.orderSms, false);
  assert.equal(config.trackingSms, false);
  assert.equal(config.otpTemplateId, '1777179214877098475');
  assert.equal(config.orderTemplateId, '1777179214792762931');
  assert.equal(config.confirmedStaleCreditExpiry, '');
  assert.throws(() => readConfig({ TELINFY_BASE_URL: 'https://attacker.example' }, { requireDatabase: false }));
  assert.throws(() => readConfig({ MESSAGING_DRY_RUN: '0' }, { requireDatabase: false }));
});

test('webhook verification requires the exact raw body, a valid signature and the correct secret', () => {
  const body = Buffer.from('{ "id": 123 }\n');
  const signature = createHmac('sha256', 'test-secret').update(body).digest('base64');
  assert.equal(verifyWebhook(body, signature, 'test-secret'), true);
  assert.equal(verifyWebhook(Buffer.from('{"id":123}'), signature, 'test-secret'), false);
  assert.equal(verifyWebhook(body, signature, 'wrong'), false);
  assert.equal(verifyWebhook(body, 'abc', 'test-secret'), false);
  assert.equal(verifyWebhook(body, signature, ''), false);
});

test('India phone normalization preserves a single recipient and rejects lists and international destinations', () => {
  assert.equal(indianMobile('+91 98765 43210'), '9876543210');
  assert.equal(indianMobile('9876543210'), '9876543210');
  assert.throws(() => indianMobile('9876543210,8765432109'));
  assert.throws(() => indianMobile('+1 987 654 3210'));
  assert.equal(orderRecipient({ shippingAddress: { phone: '+919876543210' } }), '9876543210');
  // A malformed explicit order contact is not silently replaced by another person's number.
  assert.throws(() => orderRecipient({ phone: 'bad', shippingAddress: { phone: '9876543210' } }));
});

const config = { shop: 'example.myshopify.com', orderSms: true, trackingSms: true, allowTestOrders: false };
test('notification keys deduplicate repeated order and fulfillment events and allow corrected tracking', () => {
  const first = notificationJobs('orders/create', { id: 123 }, config);
  assert.equal(first[0].dedupeKey, notificationJobs('orders/create', { id: 123 }, config)[0].dedupeKey);
  const payload = { id: 22, order_id: 123, tracking_company: 'Carrier', tracking_numbers: ['00123', '00123'] };
  const created = notificationJobs('fulfillments/create', payload, config);
  assert.equal(created.length, 1);
  assert.equal(created[0].payload.trackingNumber, '00123');
  assert.equal(created[0].dedupeKey, notificationJobs('fulfillments/update', payload, config)[0].dedupeKey);
  assert.notEqual(created[0].dedupeKey, notificationJobs('fulfillments/update', { ...payload, tracking_numbers: ['00456'] }, config)[0].dedupeKey);
  assert.equal(notificationJobs('fulfillments/create', { id: 22, order_id: 123 }, config).length, 0);
  assert.equal(notificationJobs('orders/create', { id: 123, test: true }, config).length, 0);
  assert.equal(notificationJobs('orders/create', { id: 123 }, { ...config, orderSms: false }).length, 0);
  assert.throws(() => notificationJobs('orders/create', { id: Number.MAX_SAFE_INTEGER + 1 }, config));
});

test('order text matches the delivered support example; tracking preserves zeros and rejects incompatible IDs', () => {
  const order = { name: '#1001', shippingAddress: { firstName: 'Test', lastName: 'Customer' } };
  assert.equal(orderMessage({ ...order, name: 'TEST1001' }), 'Dear Test Customer, your order TEST1001 has been received successfully. Thank you for choosing Bhima Jewellery.For any assistance or support, please feel free to contact us at 854 777 1 777');
  const text = trackingMessage(order, { carrier: 'Carrier', trackingNumber: '000123' });
  assert.match(text, /^Dear  Customer, your order#1001/);
  assert.match(text, /Tracking #: 000123\n\nThank you/);
  assert.throws(() => trackingMessage(order, { carrier: 'Carrier', trackingNumber: 'AWB00123' }), { code: 'numeric_template_variable_required' });
});

test('credit expiry timestamps are interpreted in India time', () => {
  assert.equal(creditExpiryTime('2026-10-08 17:57:18'), Date.parse('2026-10-08T17:57:18+05:30'));
  assert.equal(creditExpiryTime('2026-10-08'), Date.parse('2026-10-08T23:59:59+05:30'));
  assert.equal(creditExpiryTime(null), null);
});
