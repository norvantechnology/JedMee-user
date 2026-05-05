const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getSortFromEvent, buildOrderBy } = require("../../shared/sort");
const { MFG_COMPANY_COLUMNS } = require("../../shared/mfgCompanyInput");

function clean(v) {
  return String(v ?? "").trim();
}

async function handler(event) {
  const auth = await requirePermission(event, "MFG_COMPANIES", "VIEW");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const sort = getSortFromEvent(event);
  const orderBy = buildOrderBy({
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    allowed: {
      created_at: "created_at",
      code: "code",
      name: "name",
      short_name: "short_name",
      rack_no: "rack_no",
      updated_at: "updated_at"
    },
    fallback: "created_at DESC"
  });

  const qs = event?.queryStringParameters || {};
  const q = clean(qs.q).toLowerCase();

  const where = [`account_id = $1`, `deleted_at IS NULL`];
  const args = [ctx.accountId];
  let i = 2;
  if (q) {
    where.push(`(lower(code) like $${i} or lower(name) like $${i} or lower(coalesce(short_name,'')) like $${i} or lower(coalesce(rack_no,'')) like $${i})`);
    args.push(`%${q}%`);
    i += 1;
  }

  const res = await query(
    `
    SELECT ${MFG_COMPANY_COLUMNS}
    FROM mfg_companies
    WHERE ${where.join(" AND ")}
    ${orderBy}
    `,
    args
  );

  return ok({ companies: res.rows || [] });
}

module.exports = { handler };

