import test from 'node:test';
import assert from 'node:assert/strict';
import { TelinfyClient } from '../src/telinfy.js';
import { processOne } from '../src/worker.js';

const root = process.env.TELINFY_SIMULATION_URL;
if (!root || !/^http:\/\/127\.0\.0\.1:\d+\/telinfy$/.test(root)) {
  throw new Error('TELINFY_SIMULATION_URL must point to a local Postman simulation');
}
const control = async (route, body) => {
  const response = await fetch(`${root}/__test/${route}`, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : {});
  assert.equal(response.status, 200);
  return response.json();
};

for (const [scenario, expectedStatus, expectedCode, sends] of [
  ['success', 'accepted', undefined, 1],
  ['rejected', 'failed', 'telinfy_rejected_message', 1],
  ['wrong-recipient', 'uncertain', 'telinfy_recipient_not_confirmed', 1],
  ['unknown-response', 'uncertain', 'telinfy_unrecognized_acceptance', 1],
  ['gateway-error', 'uncertain', 'telinfy_http_502', 1],
  ['timeout-after-submit', 'uncertain', 'telinfy_connection_unknown', 1],
  ['rate-limit', 'pending', 'telinfy_rate_limited', 1],
  ['template-drift', 'failed', 'sms_template_not_validated', 0],
  ['wrong-sender', 'failed', 'sms_template_not_validated', 0],
  ['empty-wallet', 'failed', 'sms_wallet_not_funded', 0],
  ['different-expiry', 'failed', 'sms_credit_expiry_requires_confirmation', 0],
]) {
  test(`real worker and HTTP client: ${scenario}`, async () => {
    await control('reset', { scenario });
    const config = { dryRun: false, orderSms: true, trackingSms: false, allowTestOrders: false,
      sender: 'BIMJWL', orderTemplateId: '1777179214792762931', trackingTemplateId: '1777179214853851012',
      confirmedStaleCreditExpiry: '2026-10-08 17:57:18', recipientAllowlist: [], leaseSeconds: 120, maxAttempts: 3,
      telinfyBaseUrl: `${root}/unified/developer`, telinfyApiKey: 'fake-test-key', timeoutMs: 1000 };
    let claimed = false;
    let completion;
    const repository = {
      recoverExpired: async () => {},
      claim: async () => {
        if (claimed) return null;
        claimed = true;
        return { id: 1, kind: 'order_confirmation', payload: { orderId: 'gid://shopify/Order/123' }, attempts: 1 };
      },
      finish: async (_id, result) => { completion = result; },
    };
    const shopify = { order: async () => ({ name: 'TEST1001', phone: '+919876543210', test: false,
      cancelledAt: null, shippingAddress: { firstName: 'Test', lastName: 'Customer' } }) };
    const args = { config, repository, shopify, telinfy: new TelinfyClient(config), logger: { info() {} } };
    assert.equal(await processOne(args), true);
    assert.equal(completion.status, expectedStatus);
    assert.equal(completion.errorCode, expectedCode);
    if (scenario === 'rate-limit') assert.equal(completion.retryAfterSeconds, 30);
    assert.equal(await processOne(args), false);
    const state = await control('state');
    assert.equal(state.calls.length, sends);
    if (sends) assert.equal(state.calls[0].templateId, '1777179214792762931');
  });
}
