import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';

export function createMongoStorage(config, { collectionPrefix = 'bhima' } = {}) {
  if (!/^[a-z0-9_]{1,60}$/.test(collectionPrefix)) throw new Error('Invalid collection prefix');
  const client = new MongoClient(config.databaseUrl, { maxPoolSize: 5, minPoolSize: 0,
    maxIdleTimeMS: 10000, serverSelectionTimeoutMS: 5000 });
  const db = client.db(config.mongoDatabase);
  const receipts = db.collection(`${collectionPrefix}_webhook_receipts`);
  const messages = db.collection(`${collectionPrefix}_messages`);
  const repository = new MongoMessageRepository(client, receipts, messages);
  return {
    repository, db,
    async initialize() {
      // Create both collections and indexes outside transactions.
      await receipts.createIndex({ shop: 1, delivery_id: 1 }, { unique: true, name: 'delivery_unique' });
      await messages.createIndex({ status: 1, available_at: 1, _id: 1 }, { name: 'pending_ready' });
      await messages.createIndex({ status: 1, started_at: 1 }, { name: 'processing_lease' });
    },
    async close() { await client.close(); },
  };
}

export class MongoMessageRepository {
  constructor(client, receipts, messages) { Object.assign(this, { client, receipts, messages }); }

  async ready() {
    const [receiptIndex, messageIndex] = await Promise.all([
      this.receipts.indexExists('delivery_unique'), this.messages.indexExists('pending_ready'),
    ]);
    if (!receiptIndex || !messageIndex) throw new Error('Messaging database has not been initialized');
  }

  async enqueue({ shop, deliveryId, topic, jobs }) {
    if (!Array.isArray(jobs) || jobs.some(job => !['order_confirmation', 'tracking'].includes(job.kind)
      || typeof job.dedupeKey !== 'string' || !job.dedupeKey || !job.payload || typeof job.payload !== 'object')) {
      throw new Error('Invalid message batch');
    }
    const receiptId = createHash('sha256').update(JSON.stringify([shop, deliveryId])).digest('hex');
    for (let attempt = 0; attempt < 4; attempt++) {
      const session = this.client.startSession();
      try {
        return await session.withTransaction(async () => {
          const receipt = await this.receipts.updateOne({ _id: receiptId },
            { $setOnInsert: { shop, delivery_id: deliveryId, topic, created_at: new Date() } }, { upsert: true, session });
          if (!receipt.upsertedCount) return { duplicate: true, queued: 0 };
          let queued = 0;
          for (const job of jobs) {
            const result = await this.messages.updateOne({ _id: job.dedupeKey }, { $setOnInsert: {
              kind: job.kind, dedupe_key: job.dedupeKey, payload: job.payload, status: 'pending', attempts: 0,
              available_at: new Date(), created_at: new Date(), started_at: null, completed_at: null,
              recipient_last4: null, provider_ids: [], error_code: null,
            } }, { upsert: true, session });
            queued += result.upsertedCount;
          }
          return { duplicate: false, queued };
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } catch (error) {
        // Concurrent transaction upserts may conflict. A fresh transaction can
        // safely re-check the idempotency keys; Shopify retries after 503 if needed.
        if (error?.code !== 11000 || attempt === 3) throw error;
      } finally { await session.endSession(); }
    }
    throw new Error('Unable to record webhook');
  }

  async recoverExpired(leaseSeconds) {
    await this.messages.updateMany({ status: 'processing', started_at: { $lt: new Date(Date.now() - leaseSeconds * 1000) } },
      { $set: { status: 'uncertain', error_code: 'worker_lease_expired', completed_at: new Date() } });
  }

  async claim() {
    const result = await this.messages.findOneAndUpdate({ status: 'pending', available_at: { $lte: new Date() } },
      { $set: { status: 'processing', started_at: new Date() }, $inc: { attempts: 1 } },
      { sort: { available_at: 1, _id: 1 }, returnDocument: 'after', includeResultMetadata: false });
    return result ? { ...result, id: result._id } : null;
  }

  async finish(id, { status, errorCode = null, retryAfterSeconds = 0, recipientLast4 = null, providerIds = [] }) {
    const result = await this.messages.updateOne({ _id: id, status: 'processing' }, { $set: {
      status, error_code: errorCode, available_at: new Date(Date.now() + retryAfterSeconds * 1000),
      recipient_last4: recipientLast4, provider_ids: providerIds, completed_at: status === 'pending' ? null : new Date(),
    } });
    if (result.matchedCount !== 1) throw new Error('Message lease no longer owned');
  }
}
