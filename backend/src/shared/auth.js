const { fail } = require("./response");
const { verifyAccessToken } = require("./tokens");
const { hasPermission } = require("./permissions");
const { query } = require("./db");

function getBearerToken(event) {
  const h = event?.headers || {};
  const raw = h.authorization || h.Authorization || "";
  const s = String(raw || "");
  if (!s.toLowerCase().startsWith("bearer ")) return "";
  return s.slice(7).trim();
}

function requireAuth(event) {
  const token = getBearerToken(event);
  if (!token) return { ok: false, resp: fail(401, "UNAUTHORIZED", "Missing access token") };
  try {
    const claims = verifyAccessToken(token);
    return { ok: true, claims };
  } catch {
    return { ok: false, resp: fail(401, "UNAUTHORIZED", "Invalid or expired access token") };
  }
}

async function requireApprovedUser(event) {
  const auth = requireAuth(event);
  if (!auth.ok) return auth;
  const userId = String(auth.claims?.sub || "");
  if (!userId) return { ok: false, resp: fail(401, "UNAUTHORIZED", "Invalid access token") };

  const st = await query(`SELECT status, is_blocked FROM app_users WHERE id = $1 LIMIT 1`, [userId]);
  const row = st.rows[0] || null;
  const status = String(row?.status || "").toUpperCase();
  const blocked = Boolean(row?.is_blocked);
  if (blocked) return { ok: false, resp: fail(403, "ACCOUNT_BLOCKED", "Your account is blocked. Please contact support.") };
  if (status && status !== "APPROVED") {
    return {
      ok: false,
      resp: fail(403, "APPROVAL_REQUIRED", "Approval pending.", {
        subMessage: status === "REJECTED" ? "Your registration was rejected by admin." : "Your registration is under admin review."
      })
    };
  }

  return auth;
}

async function requirePermission(event, resource, action) {
  const auth = await requireApprovedUser(event);
  if (!auth.ok) return auth;
  const userId = String(auth.claims?.sub || "");

  const okPerm = await hasPermission(userId, resource, action);
  if (!okPerm) return { ok: false, resp: fail(403, "FORBIDDEN", "You do not have permission for this action") };
  return auth;
}

module.exports = { requireAuth, requireApprovedUser, requirePermission };

