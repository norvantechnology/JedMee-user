const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { resolveDateRange, applyDateRangeDate, resolveClientTimeZone } = require("../../shared/dateFilters");
const { sqlLocalDateFromTimestamptz } = require("../../shared/timezone");

function clean(v) {
  return String(v ?? "").trim();
}

async function handler(event) {
  const auth = await requirePermission(event, "PRESCRIPTIONS", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const qs = event?.queryStringParameters || {};
  const page = Math.max(1, Number(qs.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(qs.limit) || 50));
  const offset = (page - 1) * limit;
  const timeZone = resolveClientTimeZone(qs);
  const dateRange = resolveDateRange(qs);
  const doctor = clean(qs.doctor || qs.doctorName);
  const search = clean(qs.search || qs.q);

  const where = ["p.account_id = $1"];
  const params = [ctx.accountId];
  params.push(timeZone);
  const tzIdx = params.length;
  const prescriptionDateExpr = `COALESCE(p.prescription_date, ${sqlLocalDateFromTimestamptz("p.created_at", tzIdx)})`;
  applyDateRangeDate(where, params, prescriptionDateExpr, dateRange);
  if (doctor) {
    params.push(`%${doctor}%`);
    where.push(`COALESCE(p.doctor_name,'') ILIKE $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(
      COALESCE(p.patient_name,'') ILIKE $${params.length}
      OR COALESCE(p.prescription_no,'') ILIKE $${params.length}
      OR COALESCE(si.invoice_number,'') ILIKE $${params.length}
    )`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const countRes = await query(
    `
    SELECT COUNT(*)::int AS c
    FROM prescriptions p
    LEFT JOIN sales_invoices si ON si.id = p.sales_invoice_id AND si.account_id = p.account_id
    ${whereSql}
    `,
    params
  );
  const total = Number(countRes.rows?.[0]?.c || 0);
  const rows = await query(
    `
    SELECT
      p.*,
      si.invoice_number,
      si.invoice_date
    FROM prescriptions p
    LEFT JOIN sales_invoices si ON si.id = p.sales_invoice_id AND si.account_id = p.account_id
    ${whereSql}
    ORDER BY ${prescriptionDateExpr} DESC, p.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `,
    [...params, limit, offset]
  );

  const totalPages = Math.max(1, Math.ceil(total / limit));
  return ok({
    items: rows.rows || [],
    pagination: { page, limit, total, total_pages: totalPages, has_next: page < totalPages, has_prev: page > 1 }
  });
}

module.exports = { handler };
