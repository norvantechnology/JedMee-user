-- 045_pricing_plans.sql
-- Public pricing plans shown on the landing page (no auth required).
-- Managed from the admin panel; read-only from the user API.

CREATE TABLE IF NOT EXISTS pricing_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Display
  name        text NOT NULL,
  price       numeric(10,2) NOT NULL DEFAULT 0,
  period      text NOT NULL DEFAULT 'monthly'
    CHECK (period IN ('monthly', 'yearly', 'one_time', 'free')),
  description text,
  features    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array of feature strings

  -- UI decoration
  highlight   boolean NOT NULL DEFAULT false,  -- "most popular" card
  badge       text,                            -- e.g. "Best Value"
  cta         text NOT NULL DEFAULT 'Get Started',

  -- Ordering / visibility
  sort_order  integer NOT NULL DEFAULT 100,
  is_active   boolean NOT NULL DEFAULT true,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_plans_active_sort
  ON pricing_plans (sort_order ASC, id ASC)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_pricing_plans_updated_at ON pricing_plans;
CREATE TRIGGER trg_pricing_plans_updated_at
BEFORE UPDATE ON pricing_plans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed default plans (idempotent via ON CONFLICT)
INSERT INTO pricing_plans (name, price, period, description, features, highlight, badge, cta, sort_order, is_active)
VALUES
  (
    'Starter',
    0,
    'free',
    'Perfect for small pharmacies getting started.',
    '["Up to 500 products","1 user","Basic billing","Email support"]'::jsonb,
    false,
    NULL,
    'Start Free',
    10,
    true
  ),
  (
    'Professional',
    999,
    'monthly',
    'Everything you need to run a growing pharmacy.',
    '["Unlimited products","Up to 5 users","Full billing & returns","Purchase module","Reports & analytics","Priority support"]'::jsonb,
    true,
    'Most Popular',
    'Get Started',
    20,
    true
  ),
  (
    'Enterprise',
    2499,
    'monthly',
    'Advanced features for multi-branch operations.',
    '["Unlimited products & users","Multi-branch support","B2B ordering marketplace","API access","Dedicated account manager","SLA support"]'::jsonb,
    false,
    NULL,
    'Contact Sales',
    30,
    true
  )
ON CONFLICT (id) DO NOTHING;