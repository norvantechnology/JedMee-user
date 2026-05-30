/** Parse bulk sales/purchase API results for toasts and dialogs. */
export function bulkSuccessCount(data) {
  if (!data || typeof data !== "object") return 0;
  if (Number.isFinite(Number(data.successCount))) return Number(data.successCount);
  const keys = ["confirmedIds", "cancelledIds", "succeededIds", "completedCount"];
  for (const k of keys) {
    if (Array.isArray(data[k])) return data[k].length;
  }
  return 0;
}

export function formatBulkInvoiceToast(data, { actionPast = "updated", failedLabel = "failed" } = {}) {
  const success = bulkSuccessCount(data);
  const failed = Array.isArray(data?.failed) ? data.failed : [];
  if (!failed.length) {
    return { type: "success", message: `${success} bill${success === 1 ? "" : "s"} ${actionPast}.` };
  }
  const detail = failed
    .slice(0, 2)
    .map((f) => {
      const who = f.invoice_number || f.label || f.id;
      return `${who}: ${f.message || failedLabel}`;
    })
    .join("; ");
  const suffix = failed.length > 2 ? "…" : "";
  if (success > 0) {
    return {
      type: "warning",
      message: `${success} ${actionPast}; ${failed.length} failed. ${detail}${suffix}`
    };
  }
  return { type: "error", message: `${failed.length} failed. ${detail}${suffix}` };
}
