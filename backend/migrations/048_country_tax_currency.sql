-- Migration 048: Country, Tax Configuration, and Currency Configuration System
-- Supports dynamic country-based taxation (GST/VAT/Sales Tax) and currency formatting
-- Idempotent: all changes use IF NOT EXISTS / DO blocks

-- ── countries ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS countries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL UNIQUE,          -- ISO 3166-1 alpha-2 (IN, US, GB, AE, ...)
  name                TEXT NOT NULL,
  flag_emoji          TEXT,
  currency_code       TEXT NOT NULL DEFAULT 'USD',   -- default currency for this country
  locale              TEXT NOT NULL DEFAULT 'en-US', -- BCP 47 locale for number formatting
  tax_system          TEXT NOT NULL DEFAULT 'VAT',   -- GST | VAT | SALES_TAX | NONE
  tax_label           TEXT NOT NULL DEFAULT 'Tax',   -- "GST" | "VAT" | "Sales Tax" | "Tax"
  tax_id_label        TEXT NOT NULL DEFAULT 'Tax ID',-- "GST Number" | "VAT Number" | "Tax ID"
  invoice_label       TEXT NOT NULL DEFAULT 'Invoice',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INT NOT NULL DEFAULT 999,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── tax_configs ───────────────────────────────────────────────────────────────
-- Country-level tax rate configurations (multiple rates per country, e.g. CGST+SGST)
CREATE TABLE IF NOT EXISTS tax_configs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code        TEXT NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  name                TEXT NOT NULL,                 -- "GST 18%" | "VAT Standard" | "Sales Tax CA"
  rate                NUMERIC(8,4) NOT NULL DEFAULT 0, -- percentage, e.g. 18.0000
  tax_type            TEXT NOT NULL DEFAULT 'STANDARD', -- STANDARD | REDUCED | ZERO | EXEMPT | COMPOUND
  is_inclusive        BOOLEAN NOT NULL DEFAULT FALSE, -- price includes tax?
  is_compound         BOOLEAN NOT NULL DEFAULT FALSE, -- applied on top of another tax?
  applies_to          TEXT NOT NULL DEFAULT 'ALL',   -- ALL | GOODS | SERVICES | DIGITAL
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── region_tax_rules ──────────────────────────────────────────────────────────
-- State/province-level overrides (e.g. US state sales tax, Indian SGST)
CREATE TABLE IF NOT EXISTS region_tax_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code        TEXT NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  region_code         TEXT NOT NULL,                 -- state/province code (CA, NY, MH, GJ, ...)
  region_name         TEXT NOT NULL,
  tax_config_id       UUID REFERENCES tax_configs(id) ON DELETE SET NULL,
  rate_override       NUMERIC(8,4),                  -- NULL = use tax_config rate
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, region_code)
);

-- ── currency_configs ──────────────────────────────────────────────────────────
-- Extended currency metadata (supplements the frontend CURRENCIES catalogue)
CREATE TABLE IF NOT EXISTS currency_configs (
  code                TEXT PRIMARY KEY,              -- ISO 4217 (INR, USD, EUR, ...)
  name                TEXT NOT NULL,
  symbol              TEXT NOT NULL,
  locale              TEXT NOT NULL DEFAULT 'en-US',
  decimals            INT NOT NULL DEFAULT 2,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INT NOT NULL DEFAULT 999,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── user_locale_preferences ───────────────────────────────────────────────────
-- Per-user country/currency overrides (stored server-side, synced on login)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'preferred_country_code'
  ) THEN
    ALTER TABLE users ADD COLUMN preferred_country_code TEXT DEFAULT 'IN';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'preferred_currency_code'
  ) THEN
    ALTER TABLE users ADD COLUMN preferred_currency_code TEXT DEFAULT 'INR';
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_countries_code          ON countries(code);
CREATE INDEX IF NOT EXISTS idx_countries_active        ON countries(is_active);
CREATE INDEX IF NOT EXISTS idx_tax_configs_country     ON tax_configs(country_code);
CREATE INDEX IF NOT EXISTS idx_tax_configs_active      ON tax_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_tax_configs_default     ON tax_configs(country_code, is_default) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS idx_region_tax_country      ON region_tax_rules(country_code);
CREATE INDEX IF NOT EXISTS idx_region_tax_region       ON region_tax_rules(country_code, region_code);

-- ── Seed: Countries ───────────────────────────────────────────────────────────
INSERT INTO countries (code, name, flag_emoji, currency_code, locale, tax_system, tax_label, tax_id_label, invoice_label, sort_order) VALUES
  ('IN', 'India',          '🇮🇳', 'INR', 'en-IN', 'GST',        'GST',        'GST Number',  'Tax Invoice',  1),
  ('US', 'United States',  '🇺🇸', 'USD', 'en-US', 'SALES_TAX',  'Sales Tax',  'Tax ID',      'Invoice',      2),
  ('GB', 'United Kingdom', '🇬🇧', 'GBP', 'en-GB', 'VAT',        'VAT',        'VAT Number',  'VAT Invoice',  3),
  ('AE', 'UAE (Dubai)',    '🇦🇪', 'AED', 'en-AE', 'VAT',        'VAT',        'TRN',         'Tax Invoice',  4),
  ('CA', 'Canada',         '🇨🇦', 'CAD', 'en-CA', 'GST',        'GST/HST',    'Business No.','Invoice',      5),
  ('AU', 'Australia',      '🇦🇺', 'AUD', 'en-AU', 'GST',        'GST',        'ABN',         'Tax Invoice',  6),
  ('DE', 'Germany',        '🇩🇪', 'EUR', 'de-DE', 'VAT',        'MwSt.',      'USt-IdNr.',   'Rechnung',     7),
  ('FR', 'France',         '🇫🇷', 'EUR', 'fr-FR', 'VAT',        'TVA',        'SIRET',       'Facture',      8),
  ('SG', 'Singapore',      '🇸🇬', 'SGD', 'en-SG', 'GST',        'GST',        'GST Reg. No.','Tax Invoice',  9),
  ('JP', 'Japan',          '🇯🇵', 'JPY', 'ja-JP', 'VAT',        '消費税',     '登録番号',    '請求書',       10),
  ('SA', 'Saudi Arabia',   '🇸🇦', 'SAR', 'ar-SA', 'VAT',        'VAT',        'VAT Number',  'Tax Invoice',  11),
  ('MY', 'Malaysia',       '🇲🇾', 'MYR', 'ms-MY', 'GST',        'SST',        'SST No.',     'Invoice',      12),
  ('CN', 'China',          '🇨🇳', 'CNY', 'zh-CN', 'VAT',        '增值税',     '税号',        '发票',         13),
  ('NZ', 'New Zealand',    '🇳🇿', 'NZD', 'en-NZ', 'GST',        'GST',        'GST Number',  'Tax Invoice',  14),
  ('ZA', 'South Africa',   '🇿🇦', 'ZAR', 'en-ZA', 'VAT',        'VAT',        'VAT Number',  'Tax Invoice',  15)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  flag_emoji = EXCLUDED.flag_emoji,
  currency_code = EXCLUDED.currency_code,
  locale = EXCLUDED.locale,
  tax_system = EXCLUDED.tax_system,
  tax_label = EXCLUDED.tax_label,
  tax_id_label = EXCLUDED.tax_id_label,
  invoice_label = EXCLUDED.invoice_label,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ── Seed: Tax Configs ─────────────────────────────────────────────────────────
INSERT INTO tax_configs (country_code, name, rate, tax_type, is_inclusive, is_default, applies_to, sort_order) VALUES
  -- India GST slabs
  ('IN', 'GST 0%',   0,    'ZERO',     FALSE, FALSE, 'ALL',      1),
  ('IN', 'GST 5%',   5,    'STANDARD', FALSE, FALSE, 'ALL',      2),
  ('IN', 'GST 12%',  12,   'STANDARD', FALSE, FALSE, 'ALL',      3),
  ('IN', 'GST 18%',  18,   'STANDARD', FALSE, TRUE,  'ALL',      4),
  ('IN', 'GST 28%',  28,   'STANDARD', FALSE, FALSE, 'ALL',      5),
  -- USA Sales Tax (federal placeholder; state overrides in region_tax_rules)
  ('US', 'No Tax',   0,    'ZERO',     FALSE, FALSE, 'ALL',      1),
  ('US', 'Sales Tax',8.5,  'STANDARD', FALSE, TRUE,  'GOODS',    2),
  -- UK VAT
  ('GB', 'VAT 0%',   0,    'ZERO',     FALSE, FALSE, 'ALL',      1),
  ('GB', 'VAT 5%',   5,    'REDUCED',  FALSE, FALSE, 'ALL',      2),
  ('GB', 'VAT 20%',  20,   'STANDARD', FALSE, TRUE,  'ALL',      3),
  -- UAE VAT
  ('AE', 'VAT 0%',   0,    'ZERO',     FALSE, FALSE, 'ALL',      1),
  ('AE', 'VAT 5%',   5,    'STANDARD', FALSE, TRUE,  'ALL',      2),
  -- Canada GST/HST
  ('CA', 'GST 5%',   5,    'STANDARD', FALSE, FALSE, 'ALL',      1),
  ('CA', 'HST 13%',  13,   'STANDARD', FALSE, FALSE, 'ALL',      2),
  ('CA', 'HST 15%',  15,   'STANDARD', FALSE, TRUE,  'ALL',      3),
  -- Australia GST
  ('AU', 'GST 0%',   0,    'ZERO',     FALSE, FALSE, 'ALL',      1),
  ('AU', 'GST 10%',  10,   'STANDARD', FALSE, TRUE,  'ALL',      2),
  -- Germany MwSt
  ('DE', 'MwSt. 7%', 7,    'REDUCED',  FALSE, FALSE, 'ALL',      1),
  ('DE', 'MwSt. 19%',19,   'STANDARD', FALSE, TRUE,  'ALL',      2),
  -- France TVA
  ('FR', 'TVA 5.5%', 5.5,  'REDUCED',  FALSE, FALSE, 'ALL',      1),
  ('FR', 'TVA 20%',  20,   'STANDARD', FALSE, TRUE,  'ALL',      2),
  -- Singapore GST
  ('SG', 'GST 9%',   9,    'STANDARD', FALSE, TRUE,  'ALL',      1),
  -- Saudi Arabia VAT
  ('SA', 'VAT 15%',  15,   'STANDARD', FALSE, TRUE,  'ALL',      1),
  -- Malaysia SST
  ('MY', 'SST 6%',   6,    'STANDARD', FALSE, FALSE, 'ALL',      1),
  ('MY', 'SST 10%',  10,   'STANDARD', FALSE, TRUE,  'GOODS',    2)
ON CONFLICT DO NOTHING;

-- ── Seed: Currency Configs ────────────────────────────────────────────────────
INSERT INTO currency_configs (code, name, symbol, locale, decimals, sort_order) VALUES
  ('INR', 'Indian Rupee',       '₹',    'en-IN', 2,  1),
  ('USD', 'US Dollar',          '$',    'en-US', 2,  2),
  ('GBP', 'British Pound',      '£',    'en-GB', 2,  3),
  ('EUR', 'Euro',               '€',    'de-DE', 2,  4),
  ('AED', 'UAE Dirham',         'د.إ',  'en-AE', 2,  5),
  ('CAD', 'Canadian Dollar',    'CA$',  'en-CA', 2,  6),
  ('AUD', 'Australian Dollar',  'A$',   'en-AU', 2,  7),
  ('SGD', 'Singapore Dollar',   'S$',   'en-SG', 2,  8),
  ('JPY', 'Japanese Yen',       '¥',    'ja-JP', 0,  9),
  ('CNY', 'Chinese Yuan',       '¥',    'zh-CN', 2, 10),
  ('SAR', 'Saudi Riyal',        '﷼',    'ar-SA', 2, 11),
  ('MYR', 'Malaysian Ringgit',  'RM',   'ms-MY', 2, 12),
  ('NZD', 'New Zealand Dollar', 'NZ$',  'en-NZ', 2, 13),
  ('ZAR', 'South African Rand', 'R',    'en-ZA', 2, 14)
ON CONFLICT (code) DO NOTHING;

-- ── Seed: US State Sales Tax (sample) ─────────────────────────────────────────
-- These are approximate rates; real implementations should use a tax API
INSERT INTO region_tax_rules (country_code, region_code, region_name, rate_override) VALUES
  ('US', 'CA', 'California',   7.25),
  ('US', 'NY', 'New York',     8.00),
  ('US', 'TX', 'Texas',        6.25),
  ('US', 'FL', 'Florida',      6.00),
  ('US', 'WA', 'Washington',   6.50),
  ('US', 'OR', 'Oregon',       0.00),
  ('US', 'MT', 'Montana',      0.00),
  ('US', 'NH', 'New Hampshire',0.00),
  ('US', 'DE', 'Delaware',     0.00)
ON CONFLICT (country_code, region_code) DO NOTHING;

-- ── Seed: Indian State GST (SGST component) ───────────────────────────────────
INSERT INTO region_tax_rules (country_code, region_code, region_name, rate_override) VALUES
  ('IN', 'MH', 'Maharashtra',  0),
  ('IN', 'GJ', 'Gujarat',      0),
  ('IN', 'DL', 'Delhi',        0),
  ('IN', 'KA', 'Karnataka',    0),
  ('IN', 'TN', 'Tamil Nadu',   0),
  ('IN', 'WB', 'West Bengal',  0),
  ('IN', 'RJ', 'Rajasthan',    0),
  ('IN', 'UP', 'Uttar Pradesh',0)
ON CONFLICT (country_code, region_code) DO NOTHING;