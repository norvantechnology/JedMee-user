export function formatReportNum(n, digits = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return v.toFixed(digits);
}

export function formatExpiryShort(d) {
  const s = String(d || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m] = s.split("-");
  return `${m}/${y.slice(2)}`;
}

export function expiryStatus(d) {
  const s = String(d || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "unknown";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(`${s}T00:00:00`);
  const diffDays = Math.round((exp.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 90) return "near";
  return "ok";
}

export function expiryClassForDate(d) {
  const st = expiryStatus(d);
  if (st === "expired") return "rptExpiry rptExpiry_red";
  if (st === "near") return "rptExpiry rptExpiry_amber";
  return "rptExpiry rptExpiry_green";
}

