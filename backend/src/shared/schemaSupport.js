const { query } = require("./db");

const columnExistsCache = new Map();

/**
 * Returns true when a table column exists in the current schema.
 * Cached per process to avoid repeated information_schema lookups.
 */
async function hasColumn(tableName, columnName) {
  const t = String(tableName || "").trim().toLowerCase();
  const c = String(columnName || "").trim().toLowerCase();
  if (!t || !c) return false;
  const key = `${t}.${c}`;
  if (columnExistsCache.has(key)) return columnExistsCache.get(key);
  const res = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = $1
         AND column_name = $2
     ) AS ok`,
    [t, c]
  );
  const ok = Boolean(res.rows?.[0]?.ok);
  columnExistsCache.set(key, ok);
  return ok;
}

module.exports = { hasColumn };
