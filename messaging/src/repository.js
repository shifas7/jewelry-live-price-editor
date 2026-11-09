import pg from 'pg';
import { readFile } from 'node:fs/promises';

export function createPool(config) {
  return new pg.Pool({ connectionString: config.databaseUrl, max: 5, connectionTimeoutMillis: 5000 });
}

export async function migrate(pool) {
  const sql = await readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export class MessageRepository {
  constructor(pool) { this.pool = pool; }

  async ready() {
    // Readiness checks both connectivity and that the service schema was migrated.
    await this.pool.query('SELECT id FROM bhima_messages LIMIT 0');
  }

  async enqueue({ shop, deliveryId, topic, jobs }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const receipt = await client.query(`INSERT INTO bhima_webhook_receipts (shop, delivery_id, topic)
        VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING delivery_id`, [shop, deliveryId, topic]);
      let queued = 0;
      if (receipt.rowCount) {
        for (const job of jobs) {
          const result = await client.query(`INSERT INTO bhima_messages (dedupe_key, kind, payload)
            VALUES ($1, $2, $3::jsonb) ON CONFLICT DO NOTHING RETURNING id`, [job.dedupeKey, job.kind, JSON.stringify(job.payload)]);
          queued += result.rowCount;
        }
      }
      await client.query('COMMIT');
      return { duplicate: receipt.rowCount === 0, queued };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async recoverExpired(leaseSeconds) {
    // A crashed worker might already have submitted its SMS. Never blindly retry it.
    await this.pool.query(`UPDATE bhima_messages SET status = 'uncertain',
      error_code = 'worker_lease_expired', completed_at = now()
      WHERE status = 'processing' AND started_at < now() - ($1 * interval '1 second')`, [leaseSeconds]);
  }

  async claim() {
    const result = await this.pool.query(`UPDATE bhima_messages SET status = 'processing',
      attempts = attempts + 1, started_at = now()
      WHERE id = (SELECT id FROM bhima_messages WHERE status = 'pending' AND available_at <= now()
        ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`);
    return result.rows[0] || null;
  }

  async finish(id, { status, errorCode = null, retryAfterSeconds = 0, recipientLast4 = null, providerIds = [] }) {
    const result = await this.pool.query(`UPDATE bhima_messages SET status = $2, error_code = $3,
      available_at = now() + ($4 * interval '1 second'), recipient_last4 = $5, provider_ids = $6::jsonb,
      completed_at = CASE WHEN $2 = 'pending' THEN NULL ELSE now() END
      WHERE id = $1 AND status = 'processing' RETURNING id`,
    [id, status, errorCode, retryAfterSeconds, recipientLast4, JSON.stringify(providerIds)]);
    if (result.rowCount !== 1) throw new Error('Message lease no longer owned');
  }
}
