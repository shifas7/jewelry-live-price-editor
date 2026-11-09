import { IntegrationError } from './errors.js';

export class ShopifyClient {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  async query(query, variables = {}) {
    const { shop, shopifyAccessToken, shopifyApiVersion, timeoutMs } = this.config;
    if (!shop || !shopifyAccessToken) throw new IntegrationError('shopify_not_configured');
    let response;
    try {
      response = await this.fetch(`https://${shop}/admin/api/${shopifyApiVersion}/graphql.json`, {
        method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyAccessToken },
        body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new IntegrationError('shopify_connection_failed', { disposition: 'retry' });
    }
    if (!response.ok) {
      throw new IntegrationError(`shopify_http_${response.status}`, {
        httpStatus: response.status, disposition: response.status >= 500 || response.status === 429 ? 'retry' : 'failed',
      });
    }
    let result;
    try { result = await response.json(); }
    catch { throw new IntegrationError('shopify_invalid_response', { disposition: 'retry' }); }
    if (result.errors?.length) {
      const throttled = result.errors.some(error => error.extensions?.code === 'THROTTLED');
      throw new IntegrationError('shopify_query_rejected', { disposition: throttled ? 'retry' : 'failed' });
    }
    return result.data;
  }

  async readiness() {
    const data = await this.query(`query MessagingReadiness {
      shop { myshopifyDomain plan { displayName shopifyPlus partnerDevelopment }
        customerAccountsV2 { customerAccountsVersion loginRequiredAtCheckout } }
      currentAppInstallation { accessScopes { handle } }
    }`);
    return {
      ...data.shop,
      accessScopes: data.currentAppInstallation.accessScopes.map(scope => scope.handle),
    };
  }

  async order(orderId) {
    const data = await this.query(`query MessagingOrder($id: ID!) {
      order(id: $id) { id name test cancelledAt phone
        shippingAddress { phone firstName lastName }
        billingAddress { phone firstName lastName } }
    }`, { id: orderId });
    if (!data.order) throw new IntegrationError('shopify_order_unavailable', { disposition: 'skipped' });
    return data.order;
  }
}
