const bcrypt = require("bcryptjs");
const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requireAuth } = require("../../shared/auth");

async function handler(event) {
  const auth = requireAuth(event);
  if (!auth.ok) return auth.resp;

  const userId = String(auth.claims?.sub || "");
  const body = parseJsonBody(event);
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  if (!currentPassword) return fail(400, "VALIDATION_ERROR", "currentPassword is required");
  if (!newPassword || newPassword.length < 8) return fail(400, "VALIDATION_ERROR", "newPassword must be at least 8 characters");

  const res = await query(`SELECT password_hash, must_change_password FROM app_users WHERE id = $1 LIMIT 1`, [userId]);
  const row = res.rows[0];
  if (!row) return fail(404, "NOT_FOUND", "User not found");

  const okPw = await bcrypt.compare(currentPassword, row.password_hash);
  if (!okPw) return fail(401, "INVALID_CREDENTIALS", "Current password is incorrect");

  const cost = Number(process.env.BCRYPT_COST || 12);
  const passwordHash = await bcrypt.hash(newPassword, cost);

  await query(
    `
    UPDATE app_users
    SET password_hash = $2, must_change_password = false, updated_at = now()
    WHERE id = $1
    `,
    [userId, passwordHash]
  );

  return ok({ changed: true }, { message: "Password updated." });
}

module.exports = { handler };

