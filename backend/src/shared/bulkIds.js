function parseIdsFromBody(body, { max = 500 } = {}) {
  const raw = body?.ids ?? body?.id;
  const arr = Array.isArray(raw) ? raw : raw != null && raw !== "" ? [raw] : [];
  const ids = [...new Set(arr.map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (!ids.length) return { ok: false, error: "ids array is required" };
  if (ids.length > max) return { ok: false, error: `At most ${max} ids allowed` };
  return { ok: true, ids };
}

module.exports = { parseIdsFromBody };
