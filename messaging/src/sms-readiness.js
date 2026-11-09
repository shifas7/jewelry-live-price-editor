import { IntegrationError } from './errors.js';
import { OTP_TEMPLATE, ORDER_TEMPLATE, ORDER_CATALOG_TEMPLATE, TRACKING_TEMPLATE } from './templates.js';

export function creditExpiryTime(value) {
  if (!value) return null;
  // Telinfy's observed timestamp is Indian local time without an offset.
  const iso = /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(value)
    ? `${value.replace(' ', 'T')}${value.length === 10 ? 'T23:59:59' : ''}+05:30` : value;
  return Date.parse(iso);
}

function catalogText(value) {
  if (typeof value !== 'string') return null;
  // Normalize API slot labels and CRLF only, never arbitrary message whitespace.
  return value.replace(/\r\n/g, '\n').replace(/\{#(?:alp|num)#\}/g, '{#var#}');
}

export function smsTemplateChecks(config, response, { includeOtp = false } = {}) {
  const templates = response?.templates || response?.data?.templates;
  if (!Array.isArray(templates)) throw new IntegrationError('sms_template_lookup_failed');
  return [
    ...(includeOtp ? [['otp', config.otpTemplateId, [OTP_TEMPLATE]]] : []),
    ['order', config.orderTemplateId, [ORDER_TEMPLATE, ORDER_CATALOG_TEMPLATE]],
    ['tracking', config.trackingTemplateId, [TRACKING_TEMPLATE]],
  ].map(([purpose, id, variants]) => {
    const template = templates.find(item => typeof item.template_id === 'string' && item.template_id === id);
    const status = template?.status ?? 'not_returned';
    const contentMatch = Boolean(template && variants.some(text => catalogText(template.template_content) === catalogText(text)));
    const senderMatch = Array.isArray(template?.headers) && template.headers.includes(config.sender);
    const approved = [1, '1', 'approved', 'APPROVED'].includes(status);
    return { purpose, templateId: id, found: Boolean(template), contentMatch, senderMatch, status,
      valid: Boolean(template && contentMatch && senderMatch && approved) };
  });
}

export function smsWalletCheck(config, result, now = Date.now()) {
  const balance = Number(result?.wallet ?? result?.data?.wallet);
  const expiry = result?.credit_expiry ?? result?.data?.credit_expiry ?? null;
  const assessment = { balance: Number.isFinite(balance) ? balance : null, expiry, blocker: null, warnings: [] };
  if (!Number.isFinite(balance) || balance <= 0) assessment.blocker = 'sms_wallet_not_funded';
  const expiryTime = creditExpiryTime(expiry);
  if (expiryTime !== null && (!Number.isFinite(expiryTime) || expiryTime <= now)) {
    if (Number.isFinite(expiryTime) && expiry === config.confirmedStaleCreditExpiry) {
      assessment.warnings.push('sms_confirmed_stale_credit_expiry');
    } else assessment.blocker ||= 'sms_credit_expiry_requires_confirmation';
  }
  return assessment;
}

export async function validateLiveSms(config, telinfy) {
  if (config.dryRun || !(config.orderSms || config.trackingSms)) return { warnings: [] };
  const checks = smsTemplateChecks(config, await telinfy.templates());
  if (checks.some(item => (item.purpose === 'order' ? config.orderSms : config.trackingSms) && !item.valid)) {
    throw new IntegrationError('sms_template_not_validated');
  }
  const wallet = smsWalletCheck(config, await telinfy.wallet());
  if (wallet.blocker) throw new IntegrationError(wallet.blocker);
  return { warnings: wallet.warnings };
}
