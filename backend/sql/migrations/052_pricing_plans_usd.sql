-- 052_pricing_plans_usd.sql
-- Convert pricing plans to USD, add currency_code column, and replace
-- all India-specific "GST billing" feature text with generic "Tax billing".
-- Idempotent: TRUNCATE + re-insert, safe to re-run.

-- Add currency_code column if it doesn't already exist
ALTER TABLE pricing_plans
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'USD';

-- Replace all plans with USD pricing and global feature text
TRUNCATE TABLE pricing_plans RESTART IDENTITY;

INSERT INTO pricing_plans
  (name, price, period, description, features, highlight, badge, cta, sort_order, is_active, currency_code)
VALUES
  (
    'Starter',
    0,
    'free',
    'Try JedMee free for 14 days. No credit card required. Perfect for small medicine shops just getting started.',
    '["Up to 200 products & batches", "Tax billing & PDF invoices", "Basic inventory tracking", "Expiry & low stock alerts", "1 user account", "Email support"]'::jsonb,
    false,
    NULL,
    'Start Free Trial',
    1,
    true,
    'USD'
  ),
  (
    'Growth',
    9,
    'monthly',
    'For growing pharmacies that need full billing, stock control, and supplier management in one place.',
    '["Up to 2,000 products & batches", "Tax billing & PDF invoices", "Full inventory with batch tracking", "Purchase & supplier management", "Customer credit management", "Day book & sales reports", "Up to 3 user accounts", "Email support"]'::jsonb,
    false,
    NULL,
    'Get Started',
    2,
    true,
    'USD'
  ),
  (
    'Professional',
    19,
    'monthly',
    'Everything a busy pharmacy or distributor needs — billing, orders, analytics, and team access, all connected.',
    '["Unlimited products & batches", "Advanced tax billing & invoicing", "Full inventory with expiry tracking", "Online order catalog for retailers", "Customer ledger & credit control", "Supplier & purchase tracking", "Advanced analytics & P&L reports", "PDF invoices with email sharing", "Up to 10 user accounts", "Priority email support"]'::jsonb,
    true,
    'Most Popular',
    'Get Started',
    3,
    true,
    'USD'
  ),
  (
    'Enterprise',
    39,
    'monthly',
    'For large distributors and multi-branch operations that need unlimited scale, custom branding, and dedicated support.',
    '["Everything in Professional", "Unlimited user accounts", "Multi-branch management", "Custom branding on invoices", "API access for integrations", "Dedicated account manager", "Custom onboarding & training", "SLA-backed 99.9% uptime", "Phone & priority support"]'::jsonb,
    false,
    'Best Value',
    'Contact Us',
    4,
    true,
    'USD'
  );