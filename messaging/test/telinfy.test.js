import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TelinfyClient } from '../src/telinfy.js';
import { validateLiveSms, smsTemplateChecks, smsWalletCheck } from '../src/sms-readiness.js';
import { ORDER_TEMPLATE } from '../src/templates.js';

const config = { telinfyBaseUrl: 'https://hub.telinfy.com/unified/developer', telinfyApiKey: 'fake-test-key', timeoutMs: 1000 };
const sms = { recipient: '+919876543210', sender: 'BIMJWL', templateId: '1777179214792762931', text: 'Test message' };

test('SMS uses the documented schema and treats provider success as acceptance only', async () => {
  const client = new TelinfyClient(config, async (url, options) => {
    assert.equal(url, `${config.telinfyBaseUrl}/api/v1/sms/send`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['x-api-key'], 'fake-test-key');
    assert.deepEqual(JSON.parse(options.body), { Sender_Name: 'BIMJWL', SMS_Message: 'Test message', mobile_Number: '9876543210', template_id: '1777179214792762931' });
    return Response.json({ status: 'Success', bulkResult: [{ message_id: 'test-message-1' }] });
  });
  assert.deepEqual(await client.sendSms(sms), { accepted: true, providerIds: ['test-message-1'] });
});

test('ambiguous send failures are not automatically retryable and do not expose credentials', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('sensitive raw network context'); },
    async () => new Response('gateway failed', { status: 502 }),
    async () => new Response('not JSON', { status: 200 }),
    async () => Response.json({ unexpected: true }),
  ]) {
    await assert.rejects(new TelinfyClient(config, fetchImpl).sendSms(sms), error => {
      assert.equal(error.disposition, 'uncertain');
      assert.doesNotMatch(error.message, /sensitive|fake-test-key/);
      return true;
    });
  }
});

test('explicit rate limits can retry, while invalid keys and explicit provider failures cannot', async () => {
  const limited = new TelinfyClient(config, async () => new Response('', { status: 429, headers: { 'Retry-After': '60' } }));
  await assert.rejects(limited.sendSms(sms), { disposition: 'retry', retryAfterSeconds: 60 });
  const unauthorized = new TelinfyClient(config, async () => new Response('', { status: 401 }));
  await assert.rejects(unauthorized.sendSms(sms), { disposition: 'failed', httpStatus: 401 });
  const rejected = new TelinfyClient(config, async () => Response.json({ success: false }));
  await assert.rejects(rejected.sendSms(sms), { disposition: 'failed' });
});

test('live sending is blocked by template drift or expired credit, even with a positive balance', async () => {
  const liveConfig = { dryRun: false, orderSms: true, orderTemplateId: sms.templateId, sender: 'BIMJWL' };
  const provider = {
    templates: async () => ({ templates: [{ template_id: sms.templateId, status: 1, template_content: ORDER_TEMPLATE, headers: ['BIMJWL'] }] }),
    wallet: async () => ({ wallet: 10, credit_expiry: '2000-01-01 12:00:00' }),
  };
  await assert.rejects(validateLiveSms(liveConfig, provider), { code: 'sms_credit_expiry_requires_confirmation' });
  await assert.rejects(validateLiveSms(liveConfig, { ...provider, templates: async () => ({ templates: [] }) }), { code: 'sms_template_not_validated' });
});

test('observed responses array confirms acceptance for exactly the requested recipient', async () => {
  const client = new TelinfyClient(config, async () => Response.json({ responses: [{
    status: 'Success', message: 'SMS send successfully', mobile_Number: '9876543210', timestamp: '2026-11-06T06:14:15.831Z',
  }] }));
  assert.deepEqual(await client.sendSms(sms), { accepted: true, providerIds: [] });
});

test('per-recipient failure is not hidden by top-level success', async () => {
  const client = new TelinfyClient(config, async () => Response.json({ success: true, responses: [{
    status: 'Failed', mobile_Number: '9876543210', message: 'private provider context',
  }] }));
  await assert.rejects(client.sendSms(sms), { code: 'telinfy_rejected_message', disposition: 'failed' });
});

test('malformed, multiple, unknown or mismatched results stay uncertain instead of retrying', async () => {
  for (const responses of [null, [], [{ status: 'Success' }],
    [{ status: 'Success', mobile_Number: '8765432109' }],
    [{ status: 'Queued', mobile_Number: '9876543210' }],
    [{ status: 'Success', mobile_Number: '9876543210' }, { status: 'Success', mobile_Number: '9876543210' }],
  ]) {
    const client = new TelinfyClient(config, async () => Response.json({ status: 'Success', responses }));
    await assert.rejects(client.sendSms(sms), { disposition: 'uncertain' });
  }
});

test('numeric template IDs are rejected before the HTTP call can lose their precision', async () => {
  const client = new TelinfyClient(config, async () => { assert.fail('must not call provider'); });
  await assert.rejects(client.sendSms({ ...sms, templateId: Number(sms.templateId) }), { code: 'invalid_sms_template_id' });
});

const live = { dryRun: false, orderSms: true, trackingSms: true, sender: 'BIMJWL',
  orderTemplateId: sms.templateId, trackingTemplateId: '1777179214853851012' };
const observedCatalog = JSON.parse(readFileSync(new URL('./fixtures/telinfy-catalog.json', import.meta.url), 'utf8'));
const catalog = () => structuredClone(observedCatalog);

test('catalog formatting differences from the observed API pass without accepting arbitrary content drift', () => {
  assert.equal(smsTemplateChecks(live, catalog()).every(item => item.valid), true);
  for (const mutate of [
    item => { item.template_content = item.template_content.replace('Jewellery.', 'Jewellery!'); },
    item => { item.template_content = item.template_content.replace('Dear ', 'Dear  '); },
    item => { item.headers = ['OTHERX']; },
    item => { item.status = 0; },
    item => { item.template_id = '1777179214792760000'; },
    item => { item.template_id = Number(item.template_id); },
  ]) {
    const response = catalog(); mutate(response.templates[0]);
    assert.equal(smsTemplateChecks(live, response)[0].valid, false);
  }
});

test('only the explicitly confirmed stale expiry can pass with a funded wallet, with a warning', async () => {
  const expiry = '2026-10-08 17:57:18';
  const provider = { templates: async () => catalog(), wallet: async () => ({ wallet: 8.08, credit_expiry: expiry }) };
  await assert.rejects(validateLiveSms(live, provider), { code: 'sms_credit_expiry_requires_confirmation' });
  assert.deepEqual(await validateLiveSms({ ...live, confirmedStaleCreditExpiry: expiry }, provider), {
    warnings: ['sms_confirmed_stale_credit_expiry'],
  });
  for (const credit_expiry of ['2026-10-09 17:57:18', 'invalid']) {
    await assert.rejects(validateLiveSms({ ...live, confirmedStaleCreditExpiry: expiry }, {
      ...provider, wallet: async () => ({ wallet: 8.08, credit_expiry }),
    }), { code: 'sms_credit_expiry_requires_confirmation' });
  }
  for (const balance of [0, -1, 'invalid', Infinity]) {
    assert.equal(smsWalletCheck({ confirmedStaleCreditExpiry: expiry }, { wallet: balance, credit_expiry: expiry }).blocker, 'sms_wallet_not_funded');
  }
});

test('dry-run bypasses provider calls and a disabled tracking feature does not block order-only rollout', async () => {
  const noCalls = { templates: async () => assert.fail('dry-run must not call provider') };
  assert.deepEqual(await validateLiveSms({ ...live, dryRun: true }, noCalls), { warnings: [] });
  await validateLiveSms({ ...live, trackingSms: false }, {
    templates: async () => ({ templates: [catalog().templates[0]] }),
    wallet: async () => ({ wallet: 10, credit_expiry: '2099-01-01' }),
  });
});
