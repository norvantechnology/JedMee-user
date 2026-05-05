const { ok, fail } = require("../../shared/response");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getSalesInvoicePrintDoc } = require("./printDoc");

function parseIds(payload) {
  const raw = Array.isArray(payload?.ids) ? payload.ids : [];
  const out = [];
  const seen = new Set();
  for (const id of raw) {
    const s = String(id || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

async function handler(event) {
  const auth = await requirePermission(event, "SALES_INVOICES", "VIEW");
  if (!auth.ok) return auth.resp;
  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  let payload = {};
  try {
    payload = event?.body ? JSON.parse(event.body) : {};
  } catch {
    return fail(400, "VALIDATION_ERROR", "Invalid JSON body");
  }
  const ids = parseIds(payload);
  if (!ids.length) return fail(400, "VALIDATION_ERROR", "ids are required");
  if (ids.length > 50) return fail(400, "VALIDATION_ERROR", "Maximum 50 invoices per bulk print");

  try {
    const documents = [];
    const notFound = [];
    for (const id of ids) {
      const doc = await getSalesInvoicePrintDoc({ accountId: ctx.accountId, invoiceId: id });
      if (!doc) {
        notFound.push(id);
        continue;
      }
      documents.push(doc);
    }
    if (!documents.length) return fail(404, "NOT_FOUND", "No printable invoices found for provided ids");
    return ok({
      documents,
      not_found_ids: notFound
    });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };

