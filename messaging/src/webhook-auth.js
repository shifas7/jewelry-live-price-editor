import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyWebhook(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || typeof signature !== 'string') return false;
  // Reject malformed or truncated base64 instead of relying on permissive decoding.
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const received = Buffer.from(signature, 'base64');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}
