export function parseApiError(resp) {
  const err = resp?.json?.error || null;
  const raw = String(err?.message || err?.code || "Request failed");
  const msg = raw.trim();
  const sub = String(err?.subMessage || err?.sub_message || "").trim();
  const combined = sub && sub !== msg ? `${msg} ${sub}` : msg;

  // Make common validation errors clearer for users.
  const lower = msg.toLowerCase();
  if (lower.includes("sales rate") && lower.includes("mrp")) {
    return "Sales rate can’t be higher than MRP. Please increase MRP or reduce the sales rate.";
  }

  return combined;
}

/** For toasts: short title + optional detail (avoids duplicating the same text in title and body). */
export function parseApiErrorToast(resp) {
  const err = resp?.json?.error || null;
  let title = String(err?.message || err?.code || "Request failed").trim();
  const sub = String(err?.subMessage || err?.sub_message || "").trim();

  const lower = title.toLowerCase();
  if (lower.includes("sales rate") && lower.includes("mrp")) {
    title = "Sales rate is too high";
    return { title, message: "Sales rate can’t be higher than MRP. Please increase MRP or reduce the sales rate." };
  }

  if (sub) return { title, message: sub };
  return { title };
}

