const listeners = new Set();

// De-dupe identical toasts emitted close together (prevents “double toast” when
// both page-level code and apiClient auto-toasts fire, or when multiple requests fail at once).
const recentToastAt = new Map();
const DEDUPE_WINDOW_MS = 1500;
const MAX_RECENT = 50;

function toastKey(t) {
  const type = String(t?.type || "");
  // Normalise: use title if present, otherwise message.
  // This deduplicates the common pattern where apiClient emits
  // { title: "X", message: "sub" } and page code emits { message: "X" }
  // for the same underlying error - both collapse to the same key.
  const primary = String(t?.title || t?.message || "");
  return `${type}::${primary}`;
}

function shouldEmitToast(t) {
  const key = toastKey(t);
  if (!key || key === "::") return true;
  const now = Date.now();
  const last = recentToastAt.get(key) || 0;
  if (now - last < DEDUPE_WINDOW_MS) return false;
  recentToastAt.set(key, now);
  // keep map small
  if (recentToastAt.size > MAX_RECENT) {
    for (const k of recentToastAt.keys()) {
      recentToastAt.delete(k);
      if (recentToastAt.size <= MAX_RECENT) break;
    }
  }
  return true;
}

export function subscribeToasts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitToast(toast) {
  if (!shouldEmitToast(toast)) return;
  for (const fn of listeners) fn(toast);
}

export function emitApiToastFromResponse(resp) {
  const ok = Boolean(resp?.json?.ok);
  const meta = resp?.json?.meta || null;
  const err = resp?.json?.error || null;

  const status = Number(resp?.status || 0);
  // Global rule: avoid double-success toasts. UI should explicitly toast on success.
  // Keep API auto-toasts for errors only.
  if (ok) return;
  const title = ok ? meta?.message : err?.message || meta?.message;
  if (!title) return;

  const sub =
    (ok ? meta?.subMessage : err?.subMessage) ||
    (ok ? meta?.sub_message : err?.sub_message) ||
    (ok ? meta?.detail : err?.detail) ||
    (ok ? meta?.description : err?.description) ||
    (ok ? "" : err?.details?.subMessage || err?.details?.sub_message || "");

  const fallbackSub =
    status === 401
      ? "Please login again and try."
      : status === 403
        ? "You don’t have permission to do that."
        : status === 404
          ? "Requested item was not found."
          : status === 409
            ? "Please check and try a different value."
            : status >= 500
              ? "Server error. Please try again."
              : "Please try again.";

  emitToast({
    type: "error",
    title: String(title),
    message: String(sub || fallbackSub)
  });
}

