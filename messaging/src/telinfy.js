import { IntegrationError } from './errors.js';
import { indianMobile } from './phone.js';

function retryDelay(header) {
  const seconds = Number(header);
  if (header && Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.ceil(seconds), 3600);
  const timestamp = Date.parse(header || '');
  return Number.isFinite(timestamp) ? Math.min(3600, Math.max(1, Math.ceil((timestamp - Date.now()) / 1000))) : 30;
}

function providerIds(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  for (const [key, item] of Object.entries(value)) {
    if (/^(job_?id|message_?id|record_?id|campaign_?id)$/i.test(key) && ['string', 'number'].includes(typeof item)) {
      output.push(String(item).slice(0, 200));
    } else if (item && typeof item === 'object') providerIds(item, output);
  }
  return [...new Set(output)].slice(0, 20);
}

export class TelinfyClient {
  constructor(config, fetchImpl = fetch) {
    this.baseUrl = config.telinfyBaseUrl;
    this.apiKey = config.telinfyApiKey;
    this.timeoutMs = config.timeoutMs;
    this.fetch = fetchImpl;
  }

  async request(path, { method = 'GET', body } = {}) {
    if (!this.apiKey || /YOUR_API_KEY/i.test(this.apiKey)) throw new IntegrationError('telinfy_key_not_configured');
    if (!path.startsWith('/api/v1/')) throw new IntegrationError('unsupported_telinfy_path');
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        redirect: 'error',
        headers: { 'x-api-key': this.apiKey, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // Retrying a POST whose response was lost could deliver a second message.
      throw new IntegrationError('telinfy_connection_unknown', { disposition: method === 'POST' ? 'uncertain' : 'retry' });
    }
    if (!response.ok) {
      if (response.status === 429) {
        throw new IntegrationError('telinfy_rate_limited', {
          disposition: 'retry', httpStatus: 429, retryAfterSeconds: retryDelay(response.headers.get('retry-after')),
        });
      }
      throw new IntegrationError(`telinfy_http_${response.status}`, {
        httpStatus: response.status,
        disposition: method === 'POST' && response.status >= 500 ? 'uncertain' : 'failed',
      });
    }
    try {
      return await response.json();
    } catch {
      throw new IntegrationError('telinfy_invalid_response', { disposition: method === 'POST' ? 'uncertain' : 'retry' });
    }
  }

  templates() { return this.request('/api/v1/sms/templates'); }
  wallet() { return this.request('/api/v1/sms/wallet'); }
  approvedWhatsAppTemplates() { return this.request('/api/v1/whatsapp/templates/approved'); }

  async sendSms({ recipient, sender, templateId, text }) {
    if (typeof templateId !== 'string' || !/^\d{10,30}$/.test(templateId)) {
      throw new IntegrationError('invalid_sms_template_id');
    }
    const mobile = indianMobile(recipient);
    const result = await this.request('/api/v1/sms/send', {
      method: 'POST',
      body: { Sender_Name: sender, SMS_Message: text, mobile_Number: mobile, template_id: templateId },
    });
    const status = typeof result?.status === 'string' ? result.status.toLowerCase() : '';
    if (result?.success === false || ['failed', 'failure', 'error'].includes(status)) {
      throw new IntegrationError('telinfy_rejected_message');
    }
    // The real API returns one result per recipient. A top-level success must
    // never hide a failed or ambiguous individual result.
    if (result && Object.hasOwn(result, 'responses')) {
      if (!Array.isArray(result.responses) || result.responses.length !== 1) {
        throw new IntegrationError('telinfy_unrecognized_acceptance', { disposition: 'uncertain' });
      }
      const item = result.responses[0];
      let responseMobile;
      try { responseMobile = indianMobile(item?.mobile_Number ?? item?.mobile_number); }
      catch { throw new IntegrationError('telinfy_recipient_not_confirmed', { disposition: 'uncertain' }); }
      if (responseMobile !== mobile) {
        throw new IntegrationError('telinfy_recipient_not_confirmed', { disposition: 'uncertain' });
      }
      const itemStatus = typeof item?.status === 'string' ? item.status.toLowerCase() : '';
      if (item?.success === false || ['failed', 'failure', 'error'].includes(itemStatus)) {
        throw new IntegrationError('telinfy_rejected_message');
      }
      if (itemStatus !== 'success') {
        throw new IntegrationError('telinfy_unrecognized_acceptance', { disposition: 'uncertain' });
      }
      return { accepted: true, providerIds: providerIds(result) };
    }
    if (!(result?.success === true || status === 'success')) {
      throw new IntegrationError('telinfy_unrecognized_acceptance', { disposition: 'uncertain' });
    }
    return { accepted: true, providerIds: providerIds(result) };
  }
}
