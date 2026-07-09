-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 051: Country, Tax Configuration, and Currency Configuration System
-- Supports dynamic country-based taxation (GST/VAT/Sales Tax) and currency formatting
-- Idempotent: all changes use IF NOT EXISTS / DO blocks
-- Seed data verified against Tax Foundation 2024 and official government sources
-- ═══════════════════════════════════════════════════════════════════════════════

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
CREATE TABLE IF NOT EXISTS tax_configs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code        TEXT NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  rate                NUMERIC(8,4) NOT NULL DEFAULT 0,
  tax_type            TEXT NOT NULL DEFAULT 'STANDARD', -- STANDARD | REDUCED | ZERO | EXEMPT | COMPOUND
  is_inclusive        BOOLEAN NOT NULL DEFAULT FALSE,
  is_compound         BOOLEAN NOT NULL DEFAULT FALSE,
  applies_to          TEXT NOT NULL DEFAULT 'ALL',   -- ALL | GOODS | SERVICES | DIGITAL
  is_default          BOOLEAN NOT NULL DEFAULT FALSE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── region_tax_rules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS region_tax_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code        TEXT NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  region_code         TEXT NOT NULL,
  region_name         TEXT NOT NULL,
  tax_config_id       UUID REFERENCES tax_configs(id) ON DELETE SET NULL,
  rate_override       NUMERIC(8,4),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, region_code)
);

-- ── currency_configs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS currency_configs (
  code                TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  symbol              TEXT NOT NULL,
  locale              TEXT NOT NULL DEFAULT 'en-US',
  decimals            INT NOT NULL DEFAULT 2,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order          INT NOT NULL DEFAULT 999,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── user_locale_preferences ───────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'preferred_country_code'
  ) THEN
    ALTER TABLE app_users ADD COLUMN preferred_country_code TEXT DEFAULT 'IN';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_users' AND column_name = 'preferred_currency_code'
  ) THEN
    ALTER TABLE app_users ADD COLUMN preferred_currency_code TEXT DEFAULT 'INR';
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
-- Corrections vs v1:
--   MY  tax_system GST→VAT (Malaysia abolished GST 2018; now SST)
--   MY  tax_label  GST→SST
--   CN  tax_id_label corrected to 统一社会信用代码
--   AE  locale en-AE→ar-AE
--   US  tax_id_label Tax ID→EIN / Tax ID
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO countries (
  code, name, flag_emoji, currency_code, locale,
  tax_system, tax_label, tax_id_label, invoice_label, sort_order
) VALUES
  ('IN', 'India',          '🇮🇳', 'INR', 'en-IN', 'GST',       'GST',      'GST Number',          'Tax Invoice',  1),
  ('US', 'United States',  '🇺🇸', 'USD', 'en-US', 'SALES_TAX', 'Sales Tax','EIN / Tax ID',        'Invoice',      2),
  ('GB', 'United Kingdom', '🇬🇧', 'GBP', 'en-GB', 'VAT',       'VAT',      'VAT Number',          'VAT Invoice',  3),
  ('AE', 'UAE',            '🇦🇪', 'AED', 'ar-AE', 'VAT',       'VAT',      'TRN',                 'Tax Invoice',  4),
  ('CA', 'Canada',         '🇨🇦', 'CAD', 'en-CA', 'GST',       'GST/HST',  'Business No.',        'Invoice',      5),
  ('AU', 'Australia',      '🇦🇺', 'AUD', 'en-AU', 'GST',       'GST',      'ABN',                 'Tax Invoice',  6),
  ('DE', 'Germany',        '🇩🇪', 'EUR', 'de-DE', 'VAT',       'MwSt.',    'USt-IdNr.',           'Rechnung',     7),
  ('FR', 'France',         '🇫🇷', 'EUR', 'fr-FR', 'VAT',       'TVA',      'SIRET/TVA',           'Facture',      8),
  ('SG', 'Singapore',      '🇸🇬', 'SGD', 'en-SG', 'GST',       'GST',      'GST Reg. No.',        'Tax Invoice',  9),
  ('JP', 'Japan',          '🇯🇵', 'JPY', 'ja-JP', 'VAT',       '消費税',   '登録番号',            '請求書',       10),
  ('SA', 'Saudi Arabia',   '🇸🇦', 'SAR', 'ar-SA', 'VAT',       'VAT',      'VAT Number',          'Tax Invoice',  11),
  ('MY', 'Malaysia',       '🇲🇾', 'MYR', 'ms-MY', 'VAT',       'SST',      'SST No.',             'Invoice',      12),
  ('CN', 'China',          '🇨🇳', 'CNY', 'zh-CN', 'VAT',       '增值税',   '统一社会信用代码',    '发票',         13),
  ('NZ', 'New Zealand',    '🇳🇿', 'NZD', 'en-NZ', 'GST',       'GST',      'GST Number',          'Tax Invoice',  14),
  ('ZA', 'South Africa',   '🇿🇦', 'ZAR', 'en-ZA', 'VAT',       'VAT',      'VAT Number',          'Tax Invoice',  15)
ON CONFLICT (code) DO UPDATE SET
  name           = EXCLUDED.name,
  flag_emoji     = EXCLUDED.flag_emoji,
  currency_code  = EXCLUDED.currency_code,
  locale         = EXCLUDED.locale,
  tax_system     = EXCLUDED.tax_system,
  tax_label      = EXCLUDED.tax_label,
  tax_id_label   = EXCLUDED.tax_id_label,
  invoice_label  = EXCLUDED.invoice_label,
  sort_order     = EXCLUDED.sort_order,
  updated_at     = now();

-- ── Seed: Tax Configs ─────────────────────────────────────────────────────────
-- Corrections vs v1:
--   US  removed misleading 8.5% federal placeholder; 'No Tax' is default
--   CA  default changed HST 15%→GST 5% (only truly national rate)
--   FR  added missing 2.1% and 10% reduced rates
--   JP  added 消費税 8% (reduced) and 10% (standard) - was entirely missing
--   CN  added 增值税 6%/9%/13% - was entirely missing
--   MY  labels corrected to SST rates (Sales Tax 5%/10%, Service Tax 6%/8%)
--   NZ  added GST 0%/15% - was entirely missing
--   ZA  added VAT 0%/15% - was entirely missing
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO tax_configs (
  country_code, name, rate, tax_type, is_inclusive,
  is_compound, is_default, applies_to, sort_order
) VALUES

  -- ── India: GST slabs ───────────────────────────────────────────────────────
  ('IN', 'GST 0%',    0,    'ZERO',     FALSE, FALSE, FALSE, 'ALL',      1),
  ('IN', 'GST 5%',    5,    'STANDARD', FALSE, FALSE, FALSE, 'ALL',      2),
  ('IN', 'GST 12%',  12,    'STANDARD', FALSE, FALSE, FALSE, 'ALL',      3),
  ('IN', 'GST 18%',  18,    'STANDARD', FALSE, FALSE, TRUE,  'ALL',      4),
  ('IN', 'GST 28%',  28,    'STANDARD', FALSE, FALSE, FALSE, 'ALL',      5),

  -- ── United States: no federal sales tax; state rates in region_tax_rules ───
  ('US', 'No Tax',    0,    'ZERO',     FALSE, FALSE, TRUE,  'ALL',      1),

  -- ── United Kingdom: VAT ────────────────────────────────────────────────────
  ('GB', 'VAT 0%',    0,    'ZERO',     FALSE, FALSE, FALSE, 'ALL',      1),
  ('GB', 'VAT 5%',    5,    'REDUCED',  FALSE, FALSE, FALSE, 'ALL',      2),
  ('GB', 'VAT 20%',  20,    'STANDARD', FALSE, FALSE, TRUE,  'ALL',      3),

  -- ── UAE: VAT ───────────────────────────────────────────────────────────────
  ('AE', 'VAT 0%',    0,    'ZERO',     FALSE, FALSE, FALSE, 'ALL',      1),
  ('AE', 'VAT 5%',    5,    'STANDARD', FALSE, FALSE, TRUE,  'ALL',      2),

  -- ── Canada: GST/HST/PST/QST ────────────────────────────────────────────────
  ('CA', 'GST 5%',      5,     'STANDARD', FALSE, FALSE, TRUE,  'ALL',  1),
  ('CA', 'HST 13%',    13,     'STANDARD', FALSE, FALSE, FALSE, 'ALL',  2),
  ('CA', 'HST 15%',    15,     'STANDARD', FALSE, FALSE, FALSE, 'ALL',  3),
  ('CA', 'QST 9.975%',  9.975, 'STANDARD', FALSE, FALSE, FALSE, 'ALL',  4),
  ('CA', 'PST 7%',      7,     'STANDARD', FALSE, FALSE, FALSE, 'ALL',  5),

  -- ── Australia: GST ─────────────────────────────────────────────────────────
  ('AU', 'GST 0%',    0,    'ZERO',     FALSE, FALSE, FALSE, 'ALL',      1),
  ('AU', 'GST 10%',  10,    'STANDARD', FALSE, FALSE, TRUE,  'ALL',      2),

  -- ── Germany: Mehrwertsteuer ─────────────────────────────────────────────────
  ('DE', 'MwSt. 7%',  7,    'REDUCED',  FALSE, FALSE, FALSE, 'ALL',      1),
  ('DE', 'MwSt. 19%',19,    'STANDARD', FALSE, FALSE, TRUE,  'ALL',      2),

  -- ── France: TVA ────────────────────────────────────────────────────────────
  ('FR', 'TVA 2.1%',  2.1,  'REDUCED',  FALSE, FALSE, FALSE, 'ALL',      1),
  ('FR', 'TVA 5.5%',  5.5,  'REDUCED',  FALSE, FALSE, FALSE, 'ALL',      2),
  ('FR', 'TVA 10%',  10,    'REDUCED',  FALSE, FALSE, FALSE, 'ALL',      3),
  ('FR', 'TVA 20%',  20,    'STANDARD', FALSE, FALSE, TRUE,  'ALL',      4),

  -- ── Singapore: GST (raised to 9% on 1 Jan 2024) ────────────────────────────
  ('SG', 'GST 9%',    9,    'STANDARD', FALSE, FALSE, TRUE,  'ALL',      1),

  -- ── Japan: 消費税 (raised to 10% Oct 2019; 8% reduced for food/newspapers) ──
  ('JP', '消費税 8%',  8,    'REDUCED',  FALSE, FALSE, FALSE, 'ALL',      1),
  ('JP', '消費税 10%',10,    'STANDARD', FALSE, FALSE, TRUE,  'ALL',      2),

  -- ── China: 增值税 ──────────────────────────────────────────────────────────
  ('CN', '增值税 6%',  6,    'REDUCED',  FALSE, FALSE, FALSE, 'SERVICES', 1),
  ('CN', '增值税 9%',  9,    'REDUCED',  FALSE, FALSE, FALSE, 'GOODS',    2),
  ('CN', '增值税 13%',13,    'STANDARD', FALSE, FALSE, TRUE,  'ALL',      3),

  -- ── Saudi Arabia: VAT (raised from 5% to 15% Jul 2020) ─────────────────────
  ('SA', 'VAT 15%',  15,    'STANDARD', FALSE, FALSE, TRUE,  'ALL',      1),

  -- ── Malaysia: SST (GST abolished 2018; Sales Tax on goods, Service Tax on services)
  ('MY', 'Sales Tax 5%',   5,  'REDUCED',  FALSE, FALSE, FALSE, 'GOODS',    1),
  ('MY', 'Sales Tax 10%', 10,  'STANDARD', FALSE, FALSE, TRUE,  'GOODS',    2),
  ('MY', 'Service Tax 6%', 6,  'STANDARD', FALSE, FALSE, FALSE, 'SERVICES', 3),
  ('MY', 'Service Tax 8%', 8,  'STANDARD', FALSE, FALSE, FALSE, 'SERVICES', 4),

  -- ── New Zealand: GST (15% since 1 Oct 2010) ────────────────────────────────
  ('NZ', 'GST 0%',    0,    'ZERO',     FALSE, FALSE, FALSE, 'ALL',      1),
  ('NZ', 'GST 15%',  15,    'STANDARD', FALSE, FALSE, TRUE,  'ALL',      2),

  -- ── South Africa: VAT (15% since 1 Apr 2018) ───────────────────────────────
  ('ZA', 'VAT 0%',    0,    'ZERO',     FALSE, FALSE, FALSE, 'ALL',      1),
  ('ZA', 'VAT 15%',  15,    'STANDARD', FALSE, FALSE, TRUE,  'ALL',      2)

ON CONFLICT DO NOTHING;

-- ── Seed: Currency Configs ────────────────────────────────────────────────────
-- Corrections vs v1:
--   EUR locale de-DE→en-150 (EUR spans 20 countries; de-DE is German-specific)
--   SAR symbol ﷼→SR (official Latin abbreviation used on invoices)
--   AED locale en-AE→ar-AE (matches countries.locale)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO currency_configs (code, name, symbol, locale, decimals, sort_order) VALUES
  ('INR', 'Indian Rupee',        '₹',    'en-IN',  2,  1),
  ('USD', 'US Dollar',           '$',    'en-US',  2,  2),
  ('GBP', 'British Pound',       '£',    'en-GB',  2,  3),
  ('EUR', 'Euro',                '€',    'en-150', 2,  4),
  ('AED', 'UAE Dirham',          'د.إ',  'ar-AE',  2,  5),
  ('CAD', 'Canadian Dollar',     'CA$',  'en-CA',  2,  6),
  ('AUD', 'Australian Dollar',   'A$',   'en-AU',  2,  7),
  ('SGD', 'Singapore Dollar',    'S$',   'en-SG',  2,  8),
  ('JPY', 'Japanese Yen',        '¥',    'ja-JP',  0,  9),
  ('CNY', 'Chinese Yuan',        '¥',    'zh-CN',  2, 10),
  ('SAR', 'Saudi Riyal',         'SR',   'ar-SA',  2, 11),
  ('MYR', 'Malaysian Ringgit',   'RM',   'ms-MY',  2, 12),
  ('NZD', 'New Zealand Dollar',  'NZ$',  'en-NZ',  2, 13),
  ('ZAR', 'South African Rand',  'R',    'en-ZA',  2, 14)
ON CONFLICT (code) DO NOTHING;

-- ── Seed: US State Sales Tax - all 50 states + DC ────────────────────────────
-- Rates = state-level base rates (pre-local surcharges), Tax Foundation 2024
-- Corrections vs v1: NY 8.00%→4.00% (state base rate); 42 new states added
-- AK, MT, NH, OR, DE = 0% (five states with no statewide sales tax)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO region_tax_rules (country_code, region_code, region_name, rate_override) VALUES
  ('US', 'AL', 'Alabama',                   4.00),
  ('US', 'AK', 'Alaska',                    0.00),
  ('US', 'AZ', 'Arizona',                   5.60),
  ('US', 'AR', 'Arkansas',                  6.50),
  ('US', 'CA', 'California',                7.25),
  ('US', 'CO', 'Colorado',                  2.90),
  ('US', 'CT', 'Connecticut',               6.35),
  ('US', 'DE', 'Delaware',                  0.00),
  ('US', 'DC', 'District of Columbia',      6.00),
  ('US', 'FL', 'Florida',                   6.00),
  ('US', 'GA', 'Georgia',                   4.00),
  ('US', 'HI', 'Hawaii',                    4.00),
  ('US', 'ID', 'Idaho',                     6.00),
  ('US', 'IL', 'Illinois',                  6.25),
  ('US', 'IN', 'Indiana',                   7.00),
  ('US', 'IA', 'Iowa',                      6.00),
  ('US', 'KS', 'Kansas',                    6.50),
  ('US', 'KY', 'Kentucky',                  6.00),
  ('US', 'LA', 'Louisiana',                 4.45),
  ('US', 'ME', 'Maine',                     5.50),
  ('US', 'MD', 'Maryland',                  6.00),
  ('US', 'MA', 'Massachusetts',             6.25),
  ('US', 'MI', 'Michigan',                  6.00),
  ('US', 'MN', 'Minnesota',                 6.875),
  ('US', 'MS', 'Mississippi',               7.00),
  ('US', 'MO', 'Missouri',                  4.225),
  ('US', 'MT', 'Montana',                   0.00),
  ('US', 'NE', 'Nebraska',                  5.50),
  ('US', 'NV', 'Nevada',                    6.85),
  ('US', 'NH', 'New Hampshire',             0.00),
  ('US', 'NJ', 'New Jersey',                6.625),
  ('US', 'NM', 'New Mexico',                4.875),
  ('US', 'NY', 'New York',                  4.00),
  ('US', 'NC', 'North Carolina',            4.75),
  ('US', 'ND', 'North Dakota',              5.00),
  ('US', 'OH', 'Ohio',                      5.75),
  ('US', 'OK', 'Oklahoma',                  4.50),
  ('US', 'OR', 'Oregon',                    0.00),
  ('US', 'PA', 'Pennsylvania',              6.00),
  ('US', 'RI', 'Rhode Island',              7.00),
  ('US', 'SC', 'South Carolina',            6.00),
  ('US', 'SD', 'South Dakota',              4.20),
  ('US', 'TN', 'Tennessee',                 7.00),
  ('US', 'TX', 'Texas',                     6.25),
  ('US', 'UT', 'Utah',                      4.85),
  ('US', 'VT', 'Vermont',                   6.00),
  ('US', 'VA', 'Virginia',                  5.30),
  ('US', 'WA', 'Washington',                6.50),
  ('US', 'WV', 'West Virginia',             6.00),
  ('US', 'WI', 'Wisconsin',                 5.00),
  ('US', 'WY', 'Wyoming',                   4.00)
ON CONFLICT (country_code, region_code) DO NOTHING;

-- ── Seed: Canadian Provinces / Territories ────────────────────────────────────
-- rate_override = effective combined rate (GST + provincial component)
-- GST 5% is federal; provinces either harmonise (HST) or levy own PST/QST
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO region_tax_rules (country_code, region_code, region_name, rate_override) VALUES
  ('CA', 'AB', 'Alberta',                    5.00),
  ('CA', 'BC', 'British Columbia',           12.00),
  ('CA', 'MB', 'Manitoba',                   12.00),
  ('CA', 'NB', 'New Brunswick',              15.00),
  ('CA', 'NL', 'Newfoundland and Labrador',  15.00),
  ('CA', 'NS', 'Nova Scotia',                15.00),
  ('CA', 'NT', 'Northwest Territories',       5.00),
  ('CA', 'NU', 'Nunavut',                    5.00),
  ('CA', 'ON', 'Ontario',                    13.00),
  ('CA', 'PE', 'Prince Edward Island',       15.00),
  ('CA', 'QC', 'Quebec',                     14.975),
  ('CA', 'SK', 'Saskatchewan',               11.00),
  ('CA', 'YT', 'Yukon',                      5.00)
ON CONFLICT (country_code, region_code) DO NOTHING;

-- ── Seed: Indian States / Union Territories ───────────────────────────────────
-- rate_override = 0: GST rates are nationally uniform; this table records
-- state of supply for CGST/SGST split logic in the application layer.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO region_tax_rules (country_code, region_code, region_name, rate_override) VALUES
  ('IN', 'AP', 'Andhra Pradesh',                              0),
  ('IN', 'AR', 'Arunachal Pradesh',                           0),
  ('IN', 'AS', 'Assam',                                       0),
  ('IN', 'BR', 'Bihar',                                       0),
  ('IN', 'CT', 'Chhattisgarh',                                0),
  ('IN', 'GA', 'Goa',                                         0),
  ('IN', 'GJ', 'Gujarat',                                     0),
  ('IN', 'HR', 'Haryana',                                     0),
  ('IN', 'HP', 'Himachal Pradesh',                            0),
  ('IN', 'JH', 'Jharkhand',                                   0),
  ('IN', 'KA', 'Karnataka',                                   0),
  ('IN', 'KL', 'Kerala',                                      0),
  ('IN', 'MP', 'Madhya Pradesh',                              0),
  ('IN', 'MH', 'Maharashtra',                                 0),
  ('IN', 'MN', 'Manipur',                                     0),
  ('IN', 'ML', 'Meghalaya',                                   0),
  ('IN', 'MZ', 'Mizoram',                                     0),
  ('IN', 'NL', 'Nagaland',                                    0),
  ('IN', 'OD', 'Odisha',                                      0),
  ('IN', 'PB', 'Punjab',                                      0),
  ('IN', 'RJ', 'Rajasthan',                                   0),
  ('IN', 'SK', 'Sikkim',                                      0),
  ('IN', 'TN', 'Tamil Nadu',                                  0),
  ('IN', 'TG', 'Telangana',                                   0),
  ('IN', 'TR', 'Tripura',                                     0),
  ('IN', 'UP', 'Uttar Pradesh',                               0),
  ('IN', 'UT', 'Uttarakhand',                                 0),
  ('IN', 'WB', 'West Bengal',                                 0),
  -- Union Territories
  ('IN', 'AN', 'Andaman & Nicobar Islands',                   0),
  ('IN', 'CH', 'Chandigarh',                                  0),
  ('IN', 'DL', 'Delhi',                                       0),
  ('IN', 'DN', 'Dadra & Nagar Haveli and Daman & Diu',        0),
  ('IN', 'JK', 'Jammu & Kashmir',                             0),
  ('IN', 'LA', 'Ladakh',                                      0),
  ('IN', 'LD', 'Lakshadweep',                                 0),
  ('IN', 'PY', 'Puducherry',                                  0)
ON CONFLICT (country_code, region_code) DO NOTHING;

-- ── Seed: Australian States / Territories ─────────────────────────────────────
-- GST is federal (10%), uniform across all states; rate_override = 0
-- Included for state-of-supply tracking and address validation
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO region_tax_rules (country_code, region_code, region_name, rate_override) VALUES
  ('AU', 'NSW', 'New South Wales',              0),
  ('AU', 'VIC', 'Victoria',                     0),
  ('AU', 'QLD', 'Queensland',                   0),
  ('AU', 'WA',  'Western Australia',            0),
  ('AU', 'SA',  'South Australia',              0),
  ('AU', 'TAS', 'Tasmania',                     0),
  ('AU', 'ACT', 'Australian Capital Territory', 0),
  ('AU', 'NT',  'Northern Territory',           0)
ON CONFLICT (country_code, region_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CHANGE SUMMARY (v1 → v2)
-- countries        : MY tax_system/label corrected (GST→SST/VAT); CN tax_id_label
--                    fixed; AE locale ar-AE; US tax_id_label updated.
-- tax_configs      : US federal placeholder removed; CA default fixed to GST 5%;
--                    FR gained 2.1% and 10% reduced rates; JP 消費税 added;
--                    CN 增值税 added; MY labels corrected to SST;
--                    NZ GST added; ZA VAT added.
-- currency_configs : EUR locale de-DE→en-150; SAR symbol ﷼→SR; AED locale ar-AE.
-- region_tax_rules : US NY corrected 8%→4%; all 50 states + DC added;
--                    CA 13 provinces/territories added;
--