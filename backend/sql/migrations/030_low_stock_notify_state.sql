-- Tracks whether an instant low-stock alert was already sent for the current "below threshold"
-- episode. When stock goes back above the threshold, we set armed = true again so the next dip
-- can notify once.

CREATE TABLE IF NOT EXISTS low_stock_notify_state (
  account_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('BATCH', 'PRODUCT')),
  entity_id uuid NOT NULL,
  armed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, scope, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_low_stock_notify_state_account
  ON low_stock_notify_state (account_id);
