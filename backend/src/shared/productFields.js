const { query } = require("./db");

const GST_SLABS = new Set([0, 5, 12, 18, 28]);

function clean(v) {
  return String(v ?? "").trim();
}

function toBool(v) {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return null;
}

function toNumOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseGstOrNull(v) {
  const n = toNumOrNull(v);
  if (n === null) return { ok: true, value: null };
  if (!GST_SLABS.has(Number(n))) return { ok: false, value: null };
  return { ok: true, value: Number(n) };
}

function coalesceField(body, ...keys) {
  for (const k of keys) {
    if (body[k] !== undefined) return body[k];
  }
  return undefined;
}

async function resolveDivisionForAccount(accountId, divisionId) {
  const id = clean(divisionId);
  if (!id) return null;
  const r = await query(
    `SELECT id, name, code, mfg_company_id, is_active
     FROM divisions
     WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [id, accountId]
  );
  return r.rows?.[0] || null;
}

async function resolveMfgForAccount(accountId, mfgId) {
  const id = clean(mfgId);
  if (!id) return null;
  const r = await query(
    `SELECT id, name FROM mfg_companies WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, accountId]
  );
  return r.rows?.[0] || null;
}

/**
 * Normalize and validate the superset of product fields.
 * Returns { ok: true, values } or { ok: false, error }.
 *
 * When partial = true (update mode), only fields present in body are included,
 * so callers can build a partial UPDATE.
 *
 * Options:
 *  - requireDivision: when true, the FINAL state (merged with existingRow for
 *    partial updates) must have a non-null division_id. This enforces the
 *    "every product belongs to a division" invariant at the API layer.
 */
async function buildProductFields(
  body,
  accountId,
  { partial = false, existingRow = null, requireDivision = false } = {}
) {
  const out = {};

  // Division first: if provided, it overrides mfg_company_id.
  const divisionRaw = coalesceField(body, "divisionId", "division_id");
  let division = null;
  let divisionExplicitlyCleared = false;
  if (divisionRaw !== undefined) {
    const cleaned = clean(divisionRaw);
    if (cleaned) {
      division = await resolveDivisionForAccount(accountId, cleaned);
      if (!division) {
        return { ok: false, error: { code: "VALIDATION_ERROR", message: "Division not found or not in this account." } };
      }
      if (division.is_active === false) {
        return { ok: false, error: { code: "VALIDATION_ERROR", message: "Selected division is inactive. Activate it first." } };
      }
      out.division_id = division.id;
      out.mfg_company_id = division.mfg_company_id;
    } else {
      out.division_id = null;
      divisionExplicitlyCleared = true;
    }
  }

  // Explicit mfg only used if no division was resolved.
  if (!division) {
    const mfgRaw = coalesceField(body, "mfgCompanyId", "mfg_company_id");
    if (mfgRaw !== undefined) {
      const cleaned = clean(mfgRaw);
      if (cleaned) {
        const mfg = await resolveMfgForAccount(accountId, cleaned);
        if (!mfg) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid manufacturing company." } };
        out.mfg_company_id = mfg.id;
      } else {
        out.mfg_company_id = null;
      }
    }
  }

  // Enforce division presence if requested (after merging with existingRow).
  if (requireDivision) {
    let finalDivisionId;
    if (out.division_id !== undefined) finalDivisionId = out.division_id;
    else if (existingRow) finalDivisionId = existingRow.division_id ?? null;
    else finalDivisionId = null;
    if (!finalDivisionId) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: divisionExplicitlyCleared
            ? "Division is required for this product and cannot be cleared."
            : "Division is required. Select a division for this product."
        }
      };
    }
  }

  // Simple text fields
  const textFields = [
    ["name", "name"],
    ["drug_name", "drugName", "drug_name"],
    ["packing", "packing"],
    ["bulk_pack", "bulkPack", "bulk_pack"],
    ["case_pack", "casePack", "case_pack"],
    ["conversion_unit", "conversionUnit", "conversion_unit"],
    ["sales_scheme", "salesScheme", "sales_scheme"],
    ["hsn_code", "hsnCode", "hsn_code"],
    ["rack_location", "rackLocation", "rack_location"]
  ];
  for (const [col, ...aliases] of textFields) {
    const raw = coalesceField(body, ...aliases);
    if (raw !== undefined) {
      const s = clean(raw);
      out[col] = s === "" ? null : s;
    }
  }

  // Numeric (non-GST) fields
  const numFields = [
    ["scheme_qty_paid", "schemeQtyPaid", "scheme_qty_paid"],
    ["scheme_qty_free", "schemeQtyFree", "scheme_qty_free"],
    ["low_stock_threshold", "lowStockThreshold", "low_stock_threshold"],
    ["units_per_strip", "unitsPerStrip", "units_per_strip"]
  ];
  for (const [col, ...aliases] of numFields) {
    const raw = coalesceField(body, ...aliases);
    if (raw === undefined) continue;
    const n = toNumOrNull(raw);
    if (n === null && clean(raw) !== "") {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: `${col.replace(/_/g, " ")} must be a number.` } };
    }
    if (n !== null && n < 0) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: `${col.replace(/_/g, " ")} must be non-negative.` } };
    }
    // units_per_strip must be at least 1 (1 strip = 1 unit minimum)
    if (col === "units_per_strip" && n !== null && n < 1) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: "units per strip must be at least 1." } };
    }
    out[col] = n;
  }

  // GST slabs
  for (const [col, ...aliases] of [
    ["sales_gst", "salesGST", "sales_gst", "salesGst"],
    ["purchase_gst", "purchaseGST", "purchase_gst", "purchaseGst"]
  ]) {
    const raw = coalesceField(body, ...aliases);
    if (raw === undefined) continue;
    const res = parseGstOrNull(raw);
    if (!res.ok) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: `${col.replace(/_/g, " ")} must be one of 0, 5, 12, 18, 28.` } };
    }
    out[col] = res.value;
  }

  // Booleans
  for (const [col, ...aliases] of [
    ["stockable", "stockable"],
    ["is_discount_enabled", "isDiscountEnabled", "is_discount_enabled"],
    ["is_control", "isControl", "is_control"],
    ["is_half_scheme", "isHalfScheme", "is_half_scheme"],
    ["is_otc", "isOtc", "is_otc"],
    ["low_stock_alert_enabled", "lowStockAlertEnabled", "low_stock_alert_enabled"]
  ]) {
    const raw = coalesceField(body, ...aliases);
    if (raw === undefined) continue;
    const b = toBool(raw);
    if (b === null) {
      return { ok: false, error: { code: "VALIDATION_ERROR", message: `${col.replace(/_/g, " ")} must be true or false.` } };
    }
    out[col] = b;
  }

  // Scheme coherence
  const paid =
    out.scheme_qty_paid !== undefined
      ? out.scheme_qty_paid
      : existingRow
        ? Number(existingRow.scheme_qty_paid || 0)
        : null;
  const free =
    out.scheme_qty_free !== undefined
      ? out.scheme_qty_free
      : existingRow
        ? Number(existingRow.scheme_qty_free || 0)
        : null;
  if (Number(free || 0) > 0 && !(Number(paid || 0) > 0)) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Scheme qty paid must be set when scheme qty free > 0." }
    };
  }

  // Low stock alert requires a non-null threshold
  if (out.low_stock_alert_enabled === true && out.low_stock_threshold === undefined && !existingRow) {
    out.low_stock_threshold = 0;
  }

  return { ok: true, values: out, division };
}

/** Columns that are considered product-level snapshots on batches. */
const SNAPSHOT_COLUMNS = [
  "packing",
  "bulk_pack",
  "case_pack",
  "conversion_unit",
  "stockable",
  "is_discount_enabled",
  "is_control",
  "is_otc",
  "sales_gst",
  "purchase_gst",
  "sales_scheme",
  "scheme_qty_paid",
  "scheme_qty_free",
  "is_half_scheme"
];

module.exports = {
  GST_SLABS,
  buildProductFields,
  resolveDivisionForAccount,
  resolveMfgForAccount,
  SNAPSHOT_COLUMNS,
  toNumOrNull,
  toBool,
  parseGstOrNull,
  clean
};
