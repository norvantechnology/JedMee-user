import { apiGet, apiPost } from "./apiClient.js";

/**
 * @param {object} opts
 * @param {string} opts.entityType - MANUFACTURERS | DIVISIONS | ...
 * @param {string} opts.filename
 * @param {string} opts.contentBase64 - raw base64 (no data: prefix)
 */
export function importParse(opts) {
  return apiPost(
    "/import/parse",
    {
      entityType: opts.entityType,
      filename: opts.filename || "upload.csv",
      contentBase64: opts.contentBase64
    },
    { toast: "none" }
  );
}

export function importValidate(opts) {
  return apiPost(
    "/import/validate",
    {
      jobId: opts.jobId,
      columnMappings: opts.columnMappings || {}
    },
    { toast: "none" }
  );
}

export function importExecute(opts) {
  return apiPost(
    "/import/execute",
    {
      jobId: opts.jobId,
      duplicateStrategy: opts.duplicateStrategy || "UPDATE",
      skipErrors: Boolean(opts.skipErrors)
    },
    { toast: "none" }
  );
}

export function importTemplateMeta(entityType) {
  return apiGet("/import/template-meta", { params: { entityType }, toast: "none" });
}

export function importJobGet(jobId) {
  return apiGet(`/import/jobs/${encodeURIComponent(jobId)}`, { toast: "none" });
}

/** @param {{ entityType?: string, limit?: number }} [opts] */
export function importJobsList(opts = {}) {
  const params = {};
  if (opts.entityType) params.entityType = opts.entityType;
  if (opts.limit != null) params.limit = String(opts.limit);
  return apiGet("/import/jobs", { params, toast: "none" });
}
