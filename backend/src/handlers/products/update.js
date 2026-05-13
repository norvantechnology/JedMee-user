const { ok, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { refreshLowStockForProducts } = require("../../shared/lowStockInstantNotify");
const { assertProductNameUniquePerMfg } = require("../../shared/productUniqueness");
const { buildProductFields, SNAPSHOT_COLUMNS, clean } = require("../../shared/productFields");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");

function getPathParam(event, name) {
  return (
    event?.pathParameters?.[name] ||
    event?.pathParameters?.[name?.toLowerCase?.()] ||
    event?.pathParameters?.[name?.toUpperCase?.()] ||
    ""
  );
}

async function handler(event) {
  const auth = await requirePermission(event, "PRODUCT_BATCHES", "UPDATE");
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const id = String(getPathParam(event, "id") || "").trim();
  if (!id) return fail(400, "VALIDATION_ERROR", "id is required");

  const body = parseJsonBody(event);
  const curRes = await query(`SELECT * FROM products WHERE id = $1 AND account_id = $2 AND deleted_at IS NULL LIMIT 1`, [id, ctx.accountId]);
  const curRow = curRes.rows?.[0];
  if (!curRow) return fail(404, "NOT_FOUND", "Product not found.");

  const roleCode = await getRoleCodeForAccount(ctx.accountId);
  const isRetailer = roleCode === "RETAILER";
  const normalized = await buildProductFields(body, ctx.accountId, {
    partial: true,
    existingRow: curRow,
    requireDivision: !isRetailer
  });
  if (!normalized.ok) return fail(400, normalized.error.code, normalized.error.message);
  const values = normalized.values;

  // Accept name as an explicit change.
  if (body.name !== undefined) {
    const name = clean(body.name);
    if (name.length < 2) return fail(400, "VALIDATION_ERROR", "Product name must be at least 2 characters.");
    values.name = name;
  }

  const finalName = values.name !== undefined ? values.name : String(curRow.name || "");
  const finalMfg =
    values.mfg_company_id !== undefined
      ? values.mfg_company_id
      : curRow.mfg_company_id != null
        ? String(curRow.mfg_company_id)
        : "";
  const nameUnique = await assertProductNameUniquePerMfg(ctx.accountId, finalName, finalMfg, id);
  if (!nameUnique.ok) return fail(400, "VALIDATION_ERROR", nameUnique.message);

  // Build UPDATE dynamically.
  const sets = [];
  const args = [];
  let i = 1;
  const columnOrder = [
    "name",
    "drug_name",
    "division_id",
    "mfg_company_id",
    "packing",
    "bulk_pack",
    "case_pack",
    "units_per_strip",
    "conversion_unit",
    "stockable",
    "is_discount_enabled",
    "is_control",
    "is_half_scheme",
    "is_otc",
    "sales_gst",
    "purchase_gst",
    "sales_scheme",
    "scheme_qty_paid",
    "scheme_qty_free",
    "hsn_code",
    "rack_location",
    "low_stock_alert_enabled",
    "low_stock_threshold"
  ];
  for (const col of columnOrder) {
    if (values[col] === undefined) continue;
    sets.push(`${col} = $${i++}`);
    args.push(values[col]);
  }
  if (!sets.length) return fail(400, "VALIDATION_ERROR", "No fields to update.");

  sets.push("updated_by_user_id = $" + i++);
  args.push(actorId);
  sets.push("updated_at = now()");
  const idPh = i++;
  const acctPh = i++;
  args.push(id, ctx.accountId);

  try {
    const upd = await query(
      `UPDATE products SET ${sets.join(", ")} WHERE id = $${idPh} AND account_id = $${acctPh} AND deleted_at IS NULL RETURNING id`,
      args
    );
    if (!upd.rows?.[0]) return fail(404, "NOT_FOUND", "Product not found.");

    // Sync product-level snapshot fields to live batches so older reads stay consistent.
    const syncSets = [];
    const syncArgs = [ctx.accountId, id];
    let j = 3;
    for (const col of SNAPSHOT_COLUMNS) {
      if (values[col] === undefined) continue;
      syncSets.push(`${col} = $${j++}`);
      syncArgs.push(values[col]);
    }
    // Denormalized identity columns on batches
    if (values.name !== undefined) {
      syncSets.push(`product_name = $${j++}`);
      syncArgs.push(values.name);
    }
    if (values.drug_name !== undefined) {
      syncSets.push(`drug_name = $${j++}`);
      syncArgs.push(values.drug_name);
    }
    if (values.division_id !== undefined) {
      syncSets.push(`division_id = $${j++}`);
      syncArgs.push(values.division_id);
    }
    // units_per_strip on products → packing_units on batches (different column names)
    if (values.units_per_strip !== undefined && values.units_per_strip !== null) {
      syncSets.push(`packing_units = $${j++}`);
      syncArgs.push(Math.max(1, Number(values.units_per_strip) || 1));
    }
    if (syncSets.length) {
      await query(
        `UPDATE product_batches
           SET ${syncSets.join(", ")}, updated_at = now()
         WHERE account_id = $1 AND product_id = $2 AND deleted_at IS NULL`,
        syncArgs
      );
    }

    const enriched = await query(
      `
      SELECT
        p.*,
        m.name AS mfg_company_name,
        m.short_name AS mfg_short_name,
        COALESCE(m.purchase_order_lock, false) AS mfg_purchase_order_lock,
        COALESCE(m.sale_lock, false) AS mfg_sale_lock,
        COALESCE(m.prevent_discount, false) AS mfg_prevent_discount,
        COALESCE(m.prevent_free_qty, false) AS mfg_prevent_free_qty,
        COALESCE(m.prevent_net_rate, false) AS mfg_prevent_net_rate,
        d.name AS division_name,
        d.code AS division_code,
        COALESCE(d.is_active, true) AS division_is_active,
        (
          SELECT COUNT(*)::int
          FROM product_batches pb
          WHERE pb.account_id = p.account_id
            AND pb.product_id = p.id
            AND pb.deleted_at IS NULL
        ) AS active_batch_count,
        (
          SELECT COALESCE(SUM(COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0)), 0)::numeric(12,3)
          FROM product_batches pb
          LEFT JOIN (
            SELECT batch_id, SUM(COALESCE(qty,0))::numeric(12,3) AS qty, SUM(COALESCE(free_qty,0))::numeric(12,3) AS free_qty
            FROM inventory_txns
            WHERE account_id = p.account_id
            GROUP BY batch_id
          ) st ON st.batch_id = pb.id
          WHERE pb.account_id = p.account_id
            AND pb.product_id = p.id
            AND pb.deleted_at IS NULL
        ) AS total_quantity,
        (
          SELECT COUNT(*)::int
          FROM product_batches pb
          LEFT JOIN (
            SELECT batch_id, SUM(COALESCE(qty,0))::numeric(12,3) AS qty, SUM(COALESCE(free_qty,0))::numeric(12,3) AS free_qty
            FROM inventory_txns
            WHERE account_id = p.account_id
            GROUP BY batch_id
          ) st ON st.batch_id = pb.id
          WHERE pb.account_id = p.account_id
            AND pb.product_id = p.id
            AND pb.deleted_at IS NULL
            AND COALESCE(pb.low_stock_alert_enabled, false)
            AND (COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0)) <= COALESCE(pb.low_stock_threshold, 0)
        ) AS low_batch_count,
        (
          COALESCE(p.low_stock_alert_enabled, false)
          AND (
            SELECT COALESCE(SUM(COALESCE(st.qty, 0) + COALESCE(st.free_qty, 0)), 0)::numeric(12,3)
            FROM product_batches pb
            LEFT JOIN (
              SELECT batch_id, SUM(COALESCE(qty,0))::numeric(12,3) AS qty, SUM(COALESCE(free_qty,0))::numeric(12,3) AS free_qty
              FROM inventory_txns
              WHERE account_id = p.account_id
              GROUP BY batch_id
            ) st ON st.batch_id = pb.id
            WHERE pb.account_id = p.account_id
              AND pb.product_id = p.id
              AND pb.deleted_at IS NULL
          ) <= COALESCE(p.low_stock_threshold, 0)
        ) AS product_low_stock
      FROM products p
      LEFT JOIN mfg_companies m
        ON m.id = p.mfg_company_id
       AND m.account_id = p.account_id
       AND m.deleted_at IS NULL
      LEFT JOIN divisions d
        ON d.id = p.division_id
       AND d.account_id = p.account_id
       AND d.deleted_at IS NULL
      WHERE p.id = $1 AND p.account_id = $2
      LIMIT 1
      `,
      [id, ctx.accountId]
    );

    if (values.low_stock_alert_enabled !== undefined || values.low_stock_threshold !== undefined) {
      await refreshLowStockForProducts(ctx.accountId, [id]);
    }
    return ok({ product: enriched.rows?.[0] }, { message: "Product updated." });
  } catch (e) {
    console.error("[products:update]", e);
    const code = String(e.code || "");
    const constraint = String(e.constraint || "");
    if (code === "23505" && constraint.includes("products_name_per_mfg_unique")) {
      return fail(409, "NAME_EXISTS", "Another product with this name already exists under the same manufacturer.");
    }
    return fail(500, "INTERNAL_ERROR", "Something went wrong.", { subMessage: "Please try again." });
  }
}

module.exports = { handler };
