const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requireApprovedUser } = require("../../shared/auth");
const { ensurePlatformAnnouncementTable } = require("../../shared/platformAnnouncementTable");

const DEFAULTS = {
  enabled: false,
  messageText: "",
  backgroundColor: "#e0f2fe",
  textColor: "#0c4a6e",
  buttonLabel: "",
  buttonUrl: "",
  updatedAt: null
};

async function handler(event) {
  const auth = await requireApprovedUser(event);
  if (!auth.ok) return auth.resp;

  try {
    await ensurePlatformAnnouncementTable();
    const res = await query(
      `
      SELECT enabled, message_text, background_color, text_color, button_label, button_url, updated_at
      FROM platform_announcement
      WHERE id = 1
      LIMIT 1
      `,
      []
    );

    const row = res.rows[0];
    if (!row) {
      return ok({ announcement: { ...DEFAULTS } });
    }

    return ok({
      announcement: {
        enabled: Boolean(row.enabled),
        messageText: String(row.message_text || ""),
        backgroundColor: String(row.background_color || DEFAULTS.backgroundColor),
        textColor: String(row.text_color || DEFAULTS.textColor),
        buttonLabel: String(row.button_label || ""),
        buttonUrl: String(row.button_url || ""),
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
      }
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[announcement get]", e);
    return fail(500, "DB_ERROR", "Failed to load notice bar.", {
      pgCode: e?.code || undefined,
      pgMessage: String(e?.message || e)
    });
  }
}

module.exports = { handler };
