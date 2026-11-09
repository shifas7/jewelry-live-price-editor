import { IntegrationError } from './errors.js';

export const OTP_TEMPLATE = 'Dear Customer, Your OTP for mobile number verification is {#num#}. Please do not share this code with anyone - Bhima Jewellery.';
// Support supplied this delivery text; receipt was confirmed on 2026-11-06.
export const ORDER_TEMPLATE = 'Dear {#alp#}, your order {#alp#} has been received successfully. Thank you for choosing Bhima Jewellery.For any assistance or support, please feel free to contact us at 854 777 1 777';
// The Templates API still displays a paragraph break for this same template ID.
export const ORDER_CATALOG_TEMPLATE = ORDER_TEMPLATE.replace('Jewellery.For', 'Jewellery.\n\nFor');
export const TRACKING_TEMPLATE = 'Dear  Customer, your order{#alp#} has been shipped! Carrier: {#alp#} | Tracking #: {#num#}\n\nThank you for choosing Bhima Jewellery.\n\nFor any assistance or support, please feel free to contact us at 854 777 1 777';

function slot(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[\r\n\u0000-\u001f]/.test(value) || value.includes('{#')) {
    throw new IntegrationError('invalid_template_variable', { disposition: 'skipped' });
  }
  return value.trim();
}

export function renderTemplate(template, variables) {
  let index = 0;
  const message = template.replace(/\{#(alp|num)#\}/g, (_match, kind) => {
    const value = slot(variables[index++]);
    if (kind === 'num' && !/^\d+$/.test(value)) {
      throw new IntegrationError('numeric_template_variable_required', { disposition: 'skipped' });
    }
    return value;
  });
  if (index !== variables.length) throw new IntegrationError('template_variable_count_mismatch');
  return message;
}

export function orderMessage(order) {
  const address = order.shippingAddress || order.billingAddress;
  const name = [address?.firstName, address?.lastName].filter(Boolean).join(' ') || 'Customer';
  return renderTemplate(ORDER_TEMPLATE, [name, order.name]);
}

export function trackingMessage(order, payload) {
  return renderTemplate(TRACKING_TEMPLATE, [order.name, payload.carrier, payload.trackingNumber]);
}
