function normalizeSortDir(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "asc" || s === "desc") return s;
  return "";
}

function normalizeSortBy(v) {
  return String(v || "").trim();
}

function getSortFromEvent(event) {
  const q = event?.queryStringParameters || {};
  const sortBy = normalizeSortBy(q.sortBy || q.sort_by || "");
  const sortDir = normalizeSortDir(q.sortDir || q.sort_dir || "");
  return { sortBy, sortDir };
}

function buildOrderBy({ sortBy, sortDir, allowed, fallback }) {
  const dir = (sortDir || "").toLowerCase() === "asc" ? "ASC" : (sortDir || "").toLowerCase() === "desc" ? "DESC" : "";
  const col = allowed && sortBy && Object.prototype.hasOwnProperty.call(allowed, sortBy) ? allowed[sortBy] : "";
  if (col && dir) return ` ORDER BY ${col} ${dir} `;
  return ` ORDER BY ${fallback} `;
}

module.exports = { getSortFromEvent, buildOrderBy };

