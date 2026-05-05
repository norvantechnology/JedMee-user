const bcrypt = require("bcryptjs");
const { ok, fail } = require("../../shared/response");
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

function getPathParam(event, name) {
  return (
    event?.pathParameters?.[name] ||
    event?.pathParameters?.[name?.toLowerCase?.()] ||
    event?.pathParameters?.[name?.toUpperCase?.()] ||
    ""
  );
}

async function handler(event) {
  const auth = await requirePermission(event, "MFG_COMPANIES", "UPDATE");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const id = clean(getPathParam(event, "id"));
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  const curRes = await query(`SELECT * FROM mfg_companies WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, ctx.accountId]);
  const cur = curRes.rows[0] || null;
  if (!cur) return fail(404, "NOT_FOUND", "Company not found.");

  const body = parseJsonBody(event);
  const errs = [];

  const code = cleanUpper(body.code ?? cur.code);
  const name = clean(body.name ?? cur.name);
  const shortName = clean(body.shortName ?? body.short_name ?? cur.short_name);
  const rackNo = clean(body.rackNo ?? body.rack_no ?? cur.rack_no);
  const mainCompanyId = clean(body.mainCompanyId ?? body.main_company_id ?? cur.main_company_id);
  const password = clean(body.password);

  if (!code) errs.push("Code is required.");
  if (!name) errs.push("Name is required.");
  if (code.length > 32) errs.push("Code must be 32 characters or less.");
  if (name.length > 150) errs.push("Name must be 150 characters or less.");
  if (shortName.length > 30) errs.push("Short name must be 30 characters or less.");
  if (rackNo.length > 50) errs.push("Rack no must be 50 characters or less.");

  const mrEmails = validateEmailList(splitEmails(body.mrEmails ?? body.mr_emails ?? cur.mr_emails), "MR Email", errs);
  const cfEmails = validateEmailList(splitEmails(body.cfEmails ?? body.cf_emails ?? cur.cf_emails), "C&F Email", errs);
  const mfgEmails = validateEmailList(splitEmails(body.mfgEmails ?? body.mfg_emails ?? cur.mfg_emails), "Mfg. Co. Email", errs);
  const otherEmails = validateEmailList(splitEmails(body.otherEmails ?? body.other_emails ?? cur.other_emails), "Other Email", errs);

  const saleLock = body.saleLock !== undefined || body.sale_lock !== undefined ? Boolean(body.saleLock ?? body.sale_lock) : Boolean(cur.sale_lock);
  const purchaseOrderLock =
    body.purchaseOrderLock !== undefined || body.purchase_order_lock !== undefined
      ? Boolean(body.purchaseOrderLock ?? body.purchase_order_lock)
      : Boolean(cur.purchase_order_lock);
  const stockReportLock =
    body.stockReportLock !== undefined || body.stock_report_lock !== undefined ? Boolean(body.stockReportLock ?? body.stock_report_lock) : Boolean(cur.stock_report_lock);

  const preventFreeQty =
    body.preventFreeQty !== undefined || body.prevent_free_qty !== undefined ? Boolean(body.preventFreeQty ?? body.prevent_free_qty) : Boolean(cur.prevent_free_qty);
  const preventDiscount =
    body.preventDiscount !== undefined || body.prevent_discount !== undefined ? Boolean(body.preventDiscount ?? body.prevent_discount) : Boolean(cur.prevent_discount);
  const preventNetRate =
    body.preventNetRate !== undefined || body.prevent_net_rate !== undefined ? Boolean(body.preventNetRate ?? body.prevent_net_rate) : Boolean(cur.prevent_net_rate);
  const preventReturnProduct =
    body.preventReturnProduct !== undefined || body.prevent_return_product !== undefined
      ? Boolean(body.preventReturnProduct ?? body.prevent_return_product)
      : Boolean(cur.prevent_return_product);
  const preventExpiryDamageProduct =
    body.preventExpiryDamageProduct !== undefined || body.prevent_expiry_damage_product !== undefined
      ? Boolean(body.preventExpiryDamageProduct ?? body.prevent_expiry_damage_product)
      : Boolean(cur.prevent_expiry_damage_product);

  const outBillLimit =
    body.outBillLimit !== undefined || body.out_bill_limit !== undefined
      ? normalizeLimitInt(body.outBillLimit ?? body.out_bill_limit)
      : Number(cur.out_bill_limit || 0);
  const outDayLimit =
    body.outDayLimit !== undefined || body.out_day_limit !== undefined
      ? normalizeLimitInt(body.outDayLimit ?? body.out_day_limit)
      : Number(cur.out_day_limit || 0);
  const creditLimit =
    body.creditLimit !== undefined || body.credit_limit !== undefined
      ? normalizeLimitMoney(body.creditLimit ?? body.credit_limit)
      : Number(cur.credit_limit || 0);

  if (errs.length) return fail(400, "VALIDATION_ERROR", errs[0], { details: errs });

  if (mainCompanyId) {
    if (String(mainCompanyId) === String(id)) return fail(400, "VALIDATION_ERROR", "Main company cannot be itself.");
    const parent = await query(`SELECT id FROM mfg_companies WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [mainCompanyId, ctx.accountId]);
    if (!parent.rows?.[0]) return fail(400, "VALIDATION_ERROR", "Invalid main company.", { subMessage: "Selected main company was not found for this account." });
    const chain = await validateNoCircularParent(ctx.accountId, id, mainCompanyId);
    if (!chain.ok) return fail(400, "VALIDATION_ERROR", chain.message, { subMessage: "Please choose a different main company." });
  }

  const cost = Number(process.env.BCRYPT_COST || 10);
  const passwordHash = password ? await bcrypt.hash(password, cost) : cur.password_hash;

  try {
    const upd = await query(
      `
      UPDATE mfg_companies
      SET
        code = $3,
        name = $4,
        short_name = $5,
        rack_no = $6,
        password_hash = $7,
        main_company_id = $8,
        mr_emails = $9,
        cf_emails = $10,
        mfg_emails = $11,
        other_emails = $12,
        sale_lock = $13,
        purchase_order_lock = $14,
        stock_report_lock = $15,
        prevent_free_qty = $16,
        prevent_discount = $17,
        prevent_net_rate = $18,
        prevent_return_product = $19,
        prevent_expiry_damage_product = $20,
        out_bill_limit = $21,
        out_day_limit = $22,
        credit_limit = $23,
        updated_at = now()
      WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
      RETURNING ${MFG_COMPANY_COLUMNS}
      `,
      [
        id,
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
        creditLimit
      ]
    );

    return ok({ company: upd.rows[0] || null }, { message: "Manufacturing company updated.", subMessage: "Your changes have been saved successfully." });
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

