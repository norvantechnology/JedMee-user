const { query } = require("./db");
const { MSG, shortUserMessage } = require("./apiMessages");

function bulkErrMessage(errResp) {
  try {
    const b = JSON.parse(errResp.body || "{}");
    return shortUserMessage(
      b?.error?.message || b?.error?.subMessage || MSG.CANNOT_PROCESS
    );
  } catch {
    return MSG.CANNOT_PROCESS;
  }
}

async function enrichBulkFailuresWithInvoiceNumbers(q, { accountId, tableName, failed }) {
  if (!failed?.length) return [];
  const ids = [...new Set(failed.map((f) => String(f.id || "")).filter(Boolean))];
  if (!ids.length) {
    return failed.map((f) => ({
      ...f,
      message: shortUserMessage(f.message)
    }));
  }
  const rs = await q(
    `SELECT id, invoice_number FROM ${tableName}
     WHERE account_id = $1 AND id = ANY($2::uuid[])`,
    [accountId, ids]
  );
  const byId = new Map((rs.rows || []).map((r) => [String(r.id), r.invoice_number]));
  return failed.map((f) => {
    const invoiceNumber = f.invoice_number || byId.get(String(f.id)) || null;
    const label = invoiceNumber ? `Bill ${invoiceNumber}` : `Bill ${String(f.id || "").slice(0, 8)}`;
    return {
      ...f,
      invoice_number: invoiceNumber,
      message: shortUserMessage(f.message),
      label
    };
  });
}

function buildBulkInvoiceOkPayload({ succeededIds, failed, selectedCount, succeededKey }) {
  const successCount = succeededIds.length;
  const failedCount = failed.length;
  const payload = {
    successCount,
    failedCount,
    selectedCount: selectedCount ?? successCount + failedCount,
    succeededIds,
    failed
  };
  if (succeededKey) payload[succeededKey] = succeededIds;
  return payload;
}

function bulkMetaMessage({ verbPast, successCount, failedCount }) {
  if (failedCount && successCount) return `${successCount} done; ${failedCount} failed.`;
  if (failedCount) return `No bills ${verbPast}.`;
  return `${successCount} bill${successCount === 1 ? "" : "s"} ${verbPast}.`;
}

function formatFailedSummary(failed, max = 3) {
  if (!failed?.length) return "";
  return failed
    .slice(0, max)
    .map((f) => {
      const who = f.invoice_number ? f.invoice_number : f.label || f.id;
      return `${who}: ${f.message || MSG.CANNOT_PROCESS}`;
    })
    .join("; ");
}

module.exports = {
  bulkErrMessage,
  enrichBulkFailuresWithInvoiceNumbers,
  buildBulkInvoiceOkPayload,
  bulkMetaMessage,
  formatFailedSummary,
  shortUserMessage
};
