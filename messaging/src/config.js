import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

export const envPath = fileURLToPath(new URL('../.env', import.meta.url));
export const DEFAULT_BASE_URL = 'https://hub.telinfy.com/unified/developer';

export function loadEnvironment() {
  dotenv.config({ path: envPath, quiet: true });
}

function flag(env, key, fallback = false) {
  const value = env[key];
  if (value === undefined || value === '') return fallback;
  if (!['true', 'false'].includes(value)) throw new Error(`${key} must be true or false`);
  return value === 'true';
}

function integer(env, key, fallback, minimum, maximum) {
  const value = Number(env[key] || fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

export function normalizeShop(value = '') {
  const shop = value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const host = /^[a-z0-9][a-z0-9-]*$/i.test(shop) ? `${shop}.myshopify.com` : shop;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(host)) {
    throw new Error('SHOPIFY_SHOP must identify a myshopify.com store');
  }
  return host.toLowerCase();
}

export function readConfig(env = process.env, { requireDatabase = true } = {}) {
  const baseUrl = (env.TELINFY_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  // Never send credentials to a redirect target or an arbitrary configured host.
  if (baseUrl !== DEFAULT_BASE_URL) throw new Error('Unsupported TELINFY_BASE_URL');
  const config = {
    port: integer(env, 'PORT', 3010, 1, 65535),
    databaseUrl: env.DATABASE_URL || '',
    shop: env.SHOPIFY_SHOP ? normalizeShop(env.SHOPIFY_SHOP) : '',
    shopifyApiVersion: env.SHOPIFY_API_VERSION || '2026-10',
    shopifyAccessToken: env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
    webhookSecret: env.SHOPIFY_WEBHOOK_SECRET || '',
    telinfyBaseUrl: baseUrl,
    telinfyApiKey: env.TELINFY_API_KEY || '',
    sender: env.SMS_SENDER || 'BIMJWL',
    otpTemplateId: env.SMS_OTP_TEMPLATE_ID || '1777179214877098475',
    orderTemplateId: env.SMS_ORDER_TEMPLATE_ID || '1777179214792762931',
    trackingTemplateId: env.SMS_TRACKING_TEMPLATE_ID || '1777179214853851012',
    confirmedStaleCreditExpiry: env.SMS_CONFIRMED_STALE_CREDIT_EXPIRY || '',
    orderSms: flag(env, 'FEATURE_ORDER_SMS'),
    trackingSms: flag(env, 'FEATURE_TRACKING_SMS'),
    dryRun: flag(env, 'MESSAGING_DRY_RUN', true),
    allowTestOrders: flag(env, 'ALLOW_TEST_ORDERS'),
    recipientAllowlist: (env.MESSAGE_RECIPIENT_ALLOWLIST || '').split(',').map(x => x.trim()).filter(Boolean),
    timeoutMs: integer(env, 'PROVIDER_TIMEOUT_MS', 10000, 100, 30000),
    pollMs: integer(env, 'WORKER_POLL_MS', 2000, 100, 60000),
    leaseSeconds: integer(env, 'WORKER_LEASE_SECONDS', 120, 60, 3600),
    maxAttempts: integer(env, 'MAX_ATTEMPTS', 3, 1, 10),
  };
  if (!/^20\d{2}-(01|04|07|10)$/.test(config.shopifyApiVersion)) {
    throw new Error('SHOPIFY_API_VERSION must be a stable YYYY-MM version');
  }
  for (const name of ['otpTemplateId', 'orderTemplateId', 'trackingTemplateId']) {
    if (!/^\d{10,30}$/.test(config[name])) throw new Error(`Invalid ${name}`);
  }
  if (!/^[A-Z0-9]{6}$/.test(config.sender)) throw new Error('SMS_SENDER must be a six-character sender header');
  if (config.confirmedStaleCreditExpiry && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(config.confirmedStaleCreditExpiry)) {
    throw new Error('SMS_CONFIRMED_STALE_CREDIT_EXPIRY must match the exact provider timestamp');
  }
  if (requireDatabase && !config.databaseUrl) throw new Error('DATABASE_URL is required');
  if (config.databaseUrl && !/^postgres(?:ql)?:\/\//.test(config.databaseUrl)) {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }
  if (config.leaseSeconds <= config.timeoutMs * 4 / 1000 + 15) {
    throw new Error('WORKER_LEASE_SECONDS must exceed four provider timeouts plus 15 seconds');
  }
  if (config.orderSms || config.trackingSms) {
    if (!config.shop || !config.webhookSecret) throw new Error('Shop and webhook secret are required for notifications');
    if (!config.shopifyAccessToken) throw new Error('Shopify order read access is required for notifications');
    if (!config.dryRun && !config.telinfyApiKey) throw new Error('TELINFY_API_KEY is required for live sends');
  }
  return config;
}
