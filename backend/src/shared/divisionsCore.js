const { clean, addCalendarDaysYmd } = require("./purchase");

async function nextDivisionCode(q, accountId) {
  const r = await q(
    `SELECT code FROM divisions WHERE account_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 400`,
    [accountId]
  );
  let max = 0;
  for (const row of r.rows || []) {
    const m = String(row.code || "").trim().toUpperCase().match(/^DIV-(\d{4,})$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `DIV-${String(max + 1).padStart(4, "0")}`;
}

async function validateDivision(q, accountId, divisionId) {
  const id = clean(divisionId);
  if (!id) return { ok: false, message: "Division is required." };
  const r = await q(
    `SELECT d.id, d.name, d.mfg_company_id, d.credit_days, d.is_active, m.name AS mfg_company_name
     FROM divisions d
     LEFT JOIN mfg_companies m ON m.id = d.mfg_company_id AND m.account_id = d.account_id AND m.deleted_at IS NULL
     WHERE d.id = $1 AND d.account_id = $2 AND d.deleted_at IS NULL
     LIMIT 1`,
    [id, accountId]
  );
  const row = r.rows?.[0];
  if (!row) return { ok: false, message: "Selected division was not found for this account." };
  if (!Boolean(row.is_active)) return { ok: false, message: "Selected division is inactive." };
  return { ok: true, division: row };
}

function resolveDueDateFromDivision(invoiceDate, dueDate, division) {
  const explicit = clean(dueDate);
  if (explicit) return explicit;
  const days = Number(division?.credit_days || 0);
  if (!invoiceDate) return null;
  if (!(days > 0)) return null;
  return addCalendarDaysYmd(invoiceDate, days);
}

module.exports = {
  nextDivisionCode,
  validateDivision,
  resolveDueDateFromDivision
};
