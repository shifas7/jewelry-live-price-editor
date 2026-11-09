import { createHash } from 'node:crypto';

function resourceId(value, type) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Unsafe resource ID');
  const id = String(value ?? '');
  if (new RegExp(`^gid://shopify/${type}/\\d+$`).test(id)) return id;
  if (/^\d+$/.test(id)) return `gid://shopify/${type}/${id}`;
  throw new Error('Invalid resource ID');
}

function job(kind, identity, payload) {
  return { kind, dedupeKey: createHash('sha256').update(`${kind}:${identity}`).digest('hex'), payload };
}

export function notificationJobs(topic, payload, config) {
  if (topic === 'orders/create') {
    if (!config.orderSms || (payload.test && !config.allowTestOrders)) return [];
    const orderId = resourceId(payload.admin_graphql_api_id || payload.id, 'Order');
    return [job('order_confirmation', `${config.shop}:${orderId}`, { orderId })];
  }
  if (!['fulfillments/create', 'fulfillments/update'].includes(topic) || !config.trackingSms) return [];
  if (['cancelled', 'failure', 'error'].includes(payload.status)) return [];
  const numbers = payload.tracking_numbers?.length ? payload.tracking_numbers : [payload.tracking_number];
  if (!Array.isArray(numbers) || numbers.length > 50) throw new Error('Invalid tracking list');
  // A fulfillment may be created before its tracking details are assigned.
  if (!payload.tracking_company?.trim() || !numbers.some(number => typeof number === 'string' && number.trim())) return [];
  const orderId = resourceId(payload.order_id, 'Order');
  const fulfillmentId = resourceId(payload.admin_graphql_api_id || payload.id, 'Fulfillment');
  const uniqueNumbers = [...new Set(numbers.filter(number => typeof number === 'string' && number.trim()).map(number => number.trim()))];
  return uniqueNumbers.map(trackingNumber => job('tracking', `${config.shop}:${fulfillmentId}:${trackingNumber}`, {
    orderId, fulfillmentId, trackingNumber, carrier: payload.tracking_company,
  }));
}
