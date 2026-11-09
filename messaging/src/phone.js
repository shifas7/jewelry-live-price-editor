import { IntegrationError } from './errors.js';

export function indianMobile(value) {
  if (typeof value !== 'string') throw new IntegrationError('missing_customer_phone', { disposition: 'skipped' });
  let digits = value.replace(/[\s()+.-]/g, '');
  if (/^91[6-9]\d{9}$/.test(digits)) digits = digits.slice(2);
  if (!/^[6-9]\d{9}$/.test(digits)) throw new IntegrationError('unsupported_customer_phone', { disposition: 'skipped' });
  return digits;
}

export function orderRecipient(order) {
  // Use the order's own contact details, rather than a customer's unrelated saved address.
  const candidates = [order.phone, order.shippingAddress?.phone, order.billingAddress?.phone];
  for (const candidate of candidates) {
    if (candidate?.trim()) return indianMobile(candidate);
  }
  throw new IntegrationError('missing_customer_phone', { disposition: 'skipped' });
}
