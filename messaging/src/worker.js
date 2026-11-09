import { IntegrationError } from './errors.js';
import { indianMobile, orderRecipient } from './phone.js';
import { orderMessage, trackingMessage } from './templates.js';
import { validateLiveSms } from './sms-readiness.js';

export async function processOne({ config, repository, shopify, telinfy, logger = console }) {
  await repository.recoverExpired(config.leaseSeconds);
  const job = await repository.claim();
  if (!job) return false;
  let recipientLast4 = null;
  let completion;
  try {
    const enabled = job.kind === 'order_confirmation' ? config.orderSms : job.kind === 'tracking' && config.trackingSms;
    if (!enabled) throw new IntegrationError('feature_disabled', { disposition: 'skipped' });
    const order = await shopify.order(job.payload.orderId);
    if (order.cancelledAt) throw new IntegrationError('order_cancelled', { disposition: 'skipped' });
    if (order.test && !config.allowTestOrders) throw new IntegrationError('test_order_disabled', { disposition: 'skipped' });
    const recipient = orderRecipient(order);
    recipientLast4 = recipient.slice(-4);
    if (config.recipientAllowlist.length && !config.recipientAllowlist.map(indianMobile).includes(recipient)) {
      throw new IntegrationError('recipient_not_allowlisted', { disposition: 'skipped' });
    }
    const text = job.kind === 'order_confirmation' ? orderMessage(order) : trackingMessage(order, job.payload);
    if (config.dryRun) completion = { status: 'dry_run' };
    else {
      await validateLiveSms(config, telinfy);
      const result = await telinfy.sendSms({ recipient, sender: config.sender,
        templateId: job.kind === 'order_confirmation' ? config.orderTemplateId : config.trackingTemplateId, text });
      completion = { status: 'accepted', providerIds: result.providerIds };
    }
  } catch (error) {
    if (error instanceof IntegrationError) {
      const retry = error.disposition === 'retry' && job.attempts < config.maxAttempts;
      completion = { status: retry ? 'pending' : error.disposition === 'retry' ? 'failed' : error.disposition,
        errorCode: error.code, retryAfterSeconds: error.retryAfterSeconds ?? Math.min(300, 10 * 2 ** job.attempts) };
    } else completion = { status: 'uncertain', errorCode: 'unexpected_processing_error' };
  }
  // Keep this outside the send catch: failure to persist acceptance must leave the
  // lease for recovery, rather than converting an already-sent SMS to a retry.
  await repository.finish(job.id, { ...completion, recipientLast4 });
  logger.info(JSON.stringify({ event: 'message_processed', jobId: job.id, kind: job.kind, status: completion.status, errorCode: completion.errorCode }));
  return true;
}
