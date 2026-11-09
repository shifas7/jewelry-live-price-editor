CREATE TABLE IF NOT EXISTS bhima_webhook_receipts (
  shop TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shop, delivery_id)
);

CREATE TABLE IF NOT EXISTS bhima_messages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('order_confirmation', 'tracking')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'accepted', 'failed', 'uncertain', 'dry_run', 'skipped')
  ),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  recipient_last4 TEXT,
  provider_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bhima_messages_pending
  ON bhima_messages (available_at, id) WHERE status = 'pending';
