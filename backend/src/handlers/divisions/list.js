const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { clean } = require("../../shared/purchase");

async function handler(event) {
  const auth = await requirePermission(event, "DIVISIONS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const search = clean(qs.search || qs.q);
  const mfgId = clean(qs.mfg_company_id || qs.mfgCompanyId);
  const active = clean(qs.is_active ?? qs.isActive);
  const sortBy = clean(qs.sort_by || qs.sortBy || "name");
  const sortDir = clean(qs.sort_dir || qs.sortDir || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  const ORDER_MAP = { name: "d.name", code: "d.code", created_at: "d.created_at", credit_days: "d.credit_days" };
  const orderCol = ORDER_MAP[sortBy] || "d.name";

  const wh = ["d.account_id = $1", "d.deleted_at IS NULL"];
  const ps = [ctx.accountId];
  if (search) {
    ps.push(`%${search}%`);
    wh.push(`(d.name ILIKE $${ps.length} OR d.code ILIKE $${ps.length} OR d.short_name ILIKE $${ps.length})`);
  }
  if (mfgId) {
    ps.push(mfgId);
    wh.push(`d.mfg_company_id = $${ps.length}`);
  }
  if (active === "1" || active.toLowerCase() === "true") wh.push(`d.is_active IS TRUE`);
  if (active === "0" || active.toLowerCase() === "false") wh.push(`d.is_active IS FALSE`);

  try {
    const rows = await query(
      `
      SELECT d.*, m.name AS mfg_company_name
      FROM divisions d
      INNER JOIN mfg_companies m ON m.id = d.mfg_company_id AND m.account_id = d.account_id AND m.deleted_at IS NULL
      WHERE ${wh.join(" AND ")}
      ORDER BY ${orderCol} ${sortDir}, d.created_at DESC
      `,
      ps
    );
    return ok({ divisions: rows.rows || [] });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[divisions:list]", e);
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
