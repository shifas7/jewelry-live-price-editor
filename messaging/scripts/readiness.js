import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { loadEnvironment, readConfig } from '../src/config.js';
import { TelinfyClient } from '../src/telinfy.js';
import { ShopifyClient } from '../src/shopify.js';
import { smsTemplateChecks, smsWalletCheck } from '../src/sms-readiness.js';

loadEnvironment();
const environment = { ...process.env };
// An explicit read-only option reuses the pricing app's Shopify credentials locally.
// It never writes to that file or changes Shopify configuration.
if (process.argv.includes('--use-pricing-shopify')) {
  const parent = dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), processEnv: {}, quiet: true }).parsed || {};
  environment.SHOPIFY_SHOP ||= parent.SHOP_NAME;
  environment.SHOPIFY_ADMIN_ACCESS_TOKEN ||= parent.SHOPIFY_ACCESS_TOKEN;
}

const config = readConfig(environment, { requireDatabase: false });
const results = { checkedAt: new Date().toISOString(), messaging: { dryRun: config.dryRun, orderSms: config.orderSms, trackingSms: config.trackingSms }, checks: {} };
async function check(name, callback) {
  try { results.checks[name] = { status: 'ok', details: await callback() }; }
  catch (error) { results.checks[name] = { status: 'failed', code: error.code || 'check_failed', httpStatus: error.httpStatus }; }
}

const client = new TelinfyClient(config);
if (config.telinfyApiKey) {
  await check('smsTemplates', async () => {
    const response = await client.templates();
    return { total: (response.templates || response.data?.templates)?.length,
      required: smsTemplateChecks(config, response, { includeOtp: true }) };
  });
  await check('smsWallet', async () => {
    const result = await client.wallet();
    return smsWalletCheck(config, result);
  });
  await check('whatsAppTemplates', async () => {
    const result = await client.approvedWhatsAppTemplates();
    const templates = result.data?.templates || result.templates;
    if (!Array.isArray(templates)) throw new Error('Unexpected template response');
    return { total: templates.length, approvedAuthentication: templates.filter(item => item.category === 'AUTHENTICATION').map(item => ({ name: item.name, status: item.status, language: item.language })) };
  });
} else results.checks.telinfy = { status: 'not_configured' };

if (config.shop && config.shopifyAccessToken) {
  await check('shopify', () => new ShopifyClient(config).readiness());
} else results.checks.shopify = { status: 'not_configured' };

results.notificationBlockers = [];
results.notificationWarnings = [];
results.loginBlockers = [];
const checks = results.checks;
if (!config.databaseUrl) results.notificationBlockers.push('database_not_configured');
if (!config.webhookSecret) results.notificationBlockers.push('webhook_secret_not_configured');
if (checks.smsTemplates?.status !== 'ok') results.notificationBlockers.push('sms_template_access_not_verified');
else if (!checks.smsTemplates.details.required.filter(item => item.purpose !== 'otp').every(item => item.valid)) {
  results.notificationBlockers.push('sms_templates_require_review');
}
if (checks.smsWallet?.status !== 'ok') {
  results.notificationBlockers.push('sms_wallet_not_verified_or_empty');
} else {
  const wallet = checks.smsWallet.details;
  if (wallet.blocker) results.notificationBlockers.push(wallet.blocker);
  results.notificationWarnings.push(...wallet.warnings);
}
const scopes = checks.shopify?.details?.accessScopes || [];
if (!(scopes.includes('read_orders') || scopes.includes('write_orders'))) results.notificationBlockers.push('shopify_order_access_missing');
if (checks.shopify?.status !== 'ok') results.loginBlockers.push('shopify_account_configuration_unverified');
else if (!checks.shopify.details.plan.shopifyPlus) results.loginBlockers.push('supported_non_plus_login_integration_required');
if (!checks.whatsAppTemplates?.details?.approvedAuthentication?.length) results.loginBlockers.push('whatsapp_authentication_template_missing');
results.readyForLiveNotifications = results.notificationBlockers.length === 0;
results.readyForLogin = false; // No verified Shopify authentication adapter has been implemented.
console.log(JSON.stringify(results, null, 2));
if (Object.values(results.checks).some(check => check.status !== 'ok')) process.exitCode = 1;
else if (!results.readyForLiveNotifications || !results.readyForLogin) process.exitCode = 2;
