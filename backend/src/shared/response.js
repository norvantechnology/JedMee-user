const { json } = require("./http");

function normalizeMeta(meta) {
  if (!meta) return null;
  if (typeof meta === "string") return { message: meta };
  if (typeof meta === "object") {
    const message = meta.message !== undefined ? String(meta.message || "").trim() : "";
    const subMessage =
      meta.subMessage !== undefined
        ? String(meta.subMessage || "").trim()
        : meta.sub_message !== undefined
          ? String(meta.sub_message || "").trim()
          : "";
    const out = { ...meta };
    if (message) out.message = message;
    if (subMessage) out.subMessage = subMessage;
    if (!out.message) delete out.message;
    if (!out.subMessage) delete out.subMessage;
    return Object.keys(out).length ? out : null;
  }
  return null;
}

function normalizeError(code, message, details) {
  const det = details && typeof details === "object" ? details : details || null;
  const subMessage =
    det && typeof det === "object"
      ? String(det.subMessage || det.sub_message || det.userHint || det.user_hint || "").trim()
      : "";
  return {
    code,
    message,
    ...(subMessage ? { subMessage } : {}),
    details: det || null
  };
}

function ok(data, meta) {
  return json(200, { ok: true, data, meta: normalizeMeta(meta), error: null });
}

function created(data, meta) {
  return json(201, { ok: true, data, meta: normalizeMeta(meta), error: null });
}

function fail(statusCode, code, message, details) {
  return json(statusCode, {
    ok: false,
    data: null,
    meta: null,
    error: normalizeError(code, message, details)
  });
}

module.exports = { ok, created, fail };

