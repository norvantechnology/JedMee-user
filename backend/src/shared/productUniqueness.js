const { query } = require("./db");

/**
 * Enforce: product name unique per (account, manufacturer) for active rows.
 *
 * For accounts that don't track manufacturers (e.g. RETAILER products that may
 * have no mfg_company_id), we fall back to enforcing name uniqueness per
 * account so retailers don't end up with duplicate "Paracetamol" rows.
 */
async function assertProductNameUniquePerMfg(accountId, name, mfgCompanyId, excludeProductId) {
  const mfg = String(mfgCompanyId || "").trim();
  const nm = String(name || "").trim();
  if (nm.length < 2) return { ok: true };
  const ex = excludeProductId ? String(excludeProductId).trim() : "";

  if (mfg) {
    const sql = ex
      ? `SELECT id FROM products WHERE account_id = $1 AND mfg_company_id = $2 AND lower(name) = lower($3) AND deleted_at IS NULL AND id <> $4::uuid LIMIT 1`
      : `SELECT id FROM products WHERE account_id = $1 AND mfg_company_id = $2 AND lower(name) = lower($3) AND deleted_at IS NULL LIMIT 1`;
    const params = ex ? [accountId, mfg, nm, ex] : [accountId, mfg, nm];
    const r = await query(sql, params);
    if (r.rows?.[0]) {
      return {
        ok: false,
        message: `Product "${nm}" already exists under this manufacturer. Names must be unique per manufacturer across divisions.`
      };
    }
    return { ok: true };
  }

  // No manufacturer (typical for RETAILER)  enforce account-level uniqueness
  // among rows that ALSO have no manufacturer, to avoid clashing with the
  // wholesaler-style per-mfg uniqueness rule.
  const sql = ex
    ? `SELECT id FROM products WHERE account_id = $1 AND mfg_company_id IS NULL AND lower(name) = lower($2) AND deleted_at IS NULL AND id <> $3::uuid LIMIT 1`
    : `SELECT id FROM products WHERE account_id = $1 AND mfg_company_id IS NULL AND lower(name) = lower($2) AND deleted_at IS NULL LIMIT 1`;
  const params = ex ? [accountId, nm, ex] : [accountId, nm];
  const r = await query(sql, params);
  if (r.rows?.[0]) {
    return {
      ok: false,
      message: `Product "${nm}" already exists in this catalog. Use a more specific name to avoid duplicates.`
    };
  }
  return { ok: true };
}

module.exports = { assertProductNameUniquePerMfg };
