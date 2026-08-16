-- Refunds review dashboard schema.
-- Run with `npm run migrate` (uses ADMIN_DATABASE_URL). Safe to re-run.

CREATE TABLE IF NOT EXISTS users (
  id            bigserial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('viewer', 'agent', 'approver')),
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id                    bigserial PRIMARY KEY,
  name                  text NOT NULL,
  email                 text NOT NULL,
  -- Full account numbers are never stored, so there is nothing to leak.
  account_number_last4  char(4) NOT NULL CHECK (account_number_last4 ~ '^[0-9]{4}$'),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id           bigserial PRIMARY KEY,
  customer_id  bigint NOT NULL REFERENCES customers(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency     char(3) NOT NULL DEFAULT 'USD',
  description  text NOT NULL,
  occurred_at  timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refunds (
  id               bigserial PRIMARY KEY,
  customer_id      bigint NOT NULL REFERENCES customers(id),
  transaction_id   bigint NOT NULL REFERENCES transactions(id),
  amount_cents     bigint NOT NULL CHECK (amount_cents > 0),
  currency         char(3) NOT NULL DEFAULT 'USD',
  reason           text NOT NULL CHECK (reason IN (
                     'duplicate', 'fraud', 'customer_request',
                     'processing_error', 'subscription_cancellation')),
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  note             text,
  created_by       bigint NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  decided_by       bigint REFERENCES users(id),
  decided_at       timestamptz,
  decision_comment text,
  -- A decided refund always carries who decided it, when, and why.
  CONSTRAINT refunds_decision_complete CHECK (
    (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL AND decision_comment IS NULL)
    OR
    (status <> 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decision_comment IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS refunds_status_idx      ON refunds (status);
CREATE INDEX IF NOT EXISTS refunds_reason_idx      ON refunds (reason);
CREATE INDEX IF NOT EXISTS refunds_created_at_idx  ON refunds (created_at DESC);
CREATE INDEX IF NOT EXISTS refunds_amount_idx      ON refunds (amount_cents);
CREATE INDEX IF NOT EXISTS refunds_customer_idx    ON refunds (customer_id);
CREATE INDEX IF NOT EXISTS transactions_customer_idx ON transactions (customer_id, occurred_at DESC);

-- Append-only compliance trail. See the trigger and grants below: the API role
-- can INSERT and SELECT here, and nothing in the application issues UPDATE or
-- DELETE against this table.
CREATE TABLE IF NOT EXISTS audit_log (
  id            bigserial PRIMARY KEY,
  actor_user_id bigint NOT NULL REFERENCES users(id),
  action        text NOT NULL,
  refund_id     bigint REFERENCES refunds(id),
  old_status    text,
  new_status    text,
  comment       text,
  ip            inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_refund_idx ON audit_log (refund_id, created_at);

CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_mutation ON audit_log;
CREATE TRIGGER audit_log_no_mutation
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();

-- Least-privilege role used by the API process. Created here (as the schema
-- owner) so the API can never widen its own permissions.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'refunds_app') THEN
    CREATE ROLE refunds_app LOGIN PASSWORD 'refunds_app';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO refunds_app;
GRANT SELECT ON users, customers, transactions TO refunds_app;
GRANT SELECT, INSERT, UPDATE ON refunds TO refunds_app;
GRANT SELECT, INSERT ON audit_log TO refunds_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM refunds_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO refunds_app;
