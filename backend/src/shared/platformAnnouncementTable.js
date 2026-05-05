const { query } = require("./db");

/**
 * Ensures platform_announcement exists (same schema as migration 014).
 * Safe to call on every request; uses IF NOT EXISTS.
 */
async function ensurePlatformAnnouncementTable() {
  await query(
    `
    CREATE TABLE IF NOT EXISTS platform_announcement (
      id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      enabled boolean NOT NULL DEFAULT false,
      message_text text NOT NULL DEFAULT '',
      background_color varchar(32) NOT NULL DEFAULT '#e0f2fe',
      text_color varchar(32) NOT NULL DEFAULT '#0c4a6e',
      button_label varchar(120) NOT NULL DEFAULT '',
      button_url varchar(2048) NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    `,
    []
  );
  await query(
    `
    INSERT INTO platform_announcement (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING;
    `,
    []
  );
}

module.exports = { ensurePlatformAnnouncementTable };
