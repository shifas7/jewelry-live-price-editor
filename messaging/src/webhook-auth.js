import { createHmac, timingSafeEqual } from 'node:crypto';

export function webhookSignatureStatus(rawBody, signature, secret) {
  if (!secret) return 'secret_missing';
  if (!Buffer.isBuffer(rawBody)) return 'raw_body_missing';
  if (typeof signature !== 'string') return 'signature_header_missing';
  // Reject malformed or truncated base64 instead of relying on permissive decoding.
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return 'signature_format_invalid';
  const received = Buffer.from(signature, 'base64');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected) ? 'valid' : 'signature_mismatch';
}

export function verifyWebhook(rawBody, signature, secret) {
  return webhookSignatureStatus(rawBody, signature, secret) === 'valid';
}
