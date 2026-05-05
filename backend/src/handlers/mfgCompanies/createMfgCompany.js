const bcrypt = require("bcryptjs");
const { created, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const {
  clean,
  cleanUpper,
  splitEmails,
  validateEmailList,
  normalizeLimitInt,
  normalizeLimitMoney,
  MFG_COMPANY_COLUMNS
} = require("../../shared/mfgCompanyInput");
const { validateNoCircularParent } = require("../../shared/mfgCompanyPolicy");

async function nextCode(accountId) {
  const r = await query(
    `
    SELECT code
    FROM mfg_companies
    WHERE account_id = $1
    ORDER BY created_at DESC
    LIMIT 250
    `,
    [accountId]
  );
  let max = 0;
  for (const row of r.rows || []) {
    const s = String(row.code || "").trim().toUpperCase();
    const m = s.match(/^MFG-(\d{4,})$/);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  const next = max + 1;
  return `MFG-${String(next).padStart(4, "0")}`;
}

async function handler(event) {
  const auth = await requirePermission(event, "MFG_COMPANIES", "ADD");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const body = parseJsonBody(event);
  const errs = [];

  const codeRaw = cleanUpper(body.code);
  const code = codeRaw || (await nextCode(ctx.accountId));
  const name = clean(body.name);
  const shortName = clean(body.shortName || body.short_name);
  const rackNo = clean(body.rackNo || body.rack_no);
  const mainCompanyId = clean(body.mainCompanyId || body.main_company_id);
  const password = clean(body.password);

  if (!name) errs.push("Name is required.");
  if (code.length > 32) errs.push("Code must be 32 characters or less.");
  if (name.length > 150) errs.push("Name must be 150 characters or less.");
  if (shortName.length > 30) errs.push("Short name must be 30 characters or less.");
  if (rackNo.length > 50) errs.push("Rack no must be 50 characters or less.");

  const mrEmails = validateEmailList(splitEmails(body.mrEmails ?? body.mr_emails), "MR Email", errs);
  const cfEmails = validateEmailList(splitEmails(body.cfEmails ?? body.cf_emails), "C&F Email", errs);
  const mfgEmails = validateEmailList(splitEmails(body.mfgEmails ?? body.mfg_emails), "Mfg. Co. Email", errs);
  const otherEmails = validateEmailList(splitEmails(body.otherEmails ?? body.other_emails), "Other Email", errs);

  const saleLock = Boolean(body.saleLock ?? body.sale_lock);
  const purchaseOrderLock = Boolean(body.purchaseOrderLock ?? body.purchase_order_lock);
  const stockReportLock = Boolean(body.stockReportLock ?? body.stock_report_lock);

  const preventFreeQty = Boolean(body.preventFreeQty ?? body.prevent_free_qty);
  const preventDiscount = Boolean(body.preventDiscount ?? body.prevent_discount);
  const preventNetRate = Boolean(body.preventNetRate ?? body.prevent_net_rate);
  const preventReturnProduct = Boolean(body.preventReturnProduct ?? body.prevent_return_product);
  const preventExpiryDamageProduct = Boolean(body.preventExpiryDamageProduct ?? body.prevent_expiry_damage_product);

  const outBillLimit = normalizeLimitInt(body.outBillLimit ?? body.out_bill_limit);
  const outDayLimit = normalizeLimitInt(body.outDayLimit ?? body.out_day_limit);
  const creditLimit = normalizeLimitMoney(body.creditLimit ?? body.credit_limit);

  if (errs.length) return fail(400, "VALIDATION_ERROR", errs[0], { details: errs });

  if (mainCompanyId) {
    const parent = await query(`SELECT id FROM mfg_companies WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [mainCompanyId, ctx.accountId]);
    if (!parent.rows?.[0]) return fail(400, "VALIDATION_ERROR", "Invalid main company.", { subMessage: "Selected main company was not found for this account." });
    const chain = await validateNoCircularParent(ctx.accountId, null, mainCompanyId);
    if (!chain.ok) return fail(400, "VALIDATION_ERROR", chain.message, { subMessage: "Please choose a different main company." });
  }

  const cost = Number(process.env.BCRYPT_COST || 10);
  const passwordHash = password ? await bcrypt.hash(password, cost) : null;

  try {
    const ins = await query(
      `
      INSERT INTO mfg_companies (
        account_id,
        code,
        name,
        short_name,
        rack_no,
        password_hash,
        main_company_id,
        mr_emails,
        cf_emails,
        mfg_emails,
        other_emails,
        sale_lock,
        purchase_order_lock,
        stock_report_lock,
        prevent_free_qty,
        prevent_discount,
        prevent_net_rate,
        prevent_return_product,
        prevent_expiry_damage_product,
        out_bill_limit,
        out_day_limit,
        credit_limit,
        created_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING ${MFG_COMPANY_COLUMNS}
      `,
      [
        ctx.accountId,
        code,
        name,
        shortName || null,
        rackNo || null,
        passwordHash,
        mainCompanyId || null,
        mrEmails,
        cfEmails,
        mfgEmails,
        otherEmails,
        saleLock,
        purchaseOrderLock,
        stockReportLock,
        preventFreeQty,
        preventDiscount,
        preventNetRate,
        preventReturnProduct,
        preventExpiryDamageProduct,
        outBillLimit,
        outDayLimit,
        creditLimit,
        actorId
      ]
    );
    return created({ company: ins.rows[0] || null }, { message: "Manufacturing company created.", subMessage: "Company has been added successfully." });
  } catch (e) {
    const codeErr = String(e.code || "");
    const constraint = String(e.constraint || "");
    if (codeErr === "23505") {
      if (constraint.includes("mfg_companies_account_code_key") || constraint.includes("mfg_companies_code_unique")) {
        return fail(409, "CODE_EXISTS", "Code already exists.", { subMessage: "Please use a different code." });
      }
      if (constraint.includes("mfg_companies_account_name_key") || constraint.includes("mfg_companies_name_unique")) {
        return fail(409, "NAME_EXISTS", "Name already exists.", { subMessage: "Please use a different name." });
      }
    }
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };

