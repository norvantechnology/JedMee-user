import { apiPost } from "./apiClient.js";
import { uploadToPresignedUrl } from "./uploadClient.js";

export async function presignUpload({ docType, file }, opts) {
  return await apiPost(
    "/uploads/presign",
    {
      docType,
      contentType: file?.type || "",
      originalName: file?.name || ""
    },
    opts
  );
}

/** Presign PUT → browser PUT file → returns canonical HTTPS object URL (common path). */
export async function uploadRegistrationDocViaPresign({ docType, file }, opts) {
  const pres = await presignUpload({ docType, file }, opts);
  if (!(pres.status >= 200 && pres.status < 300 && pres.json?.ok)) {
    const msg = pres.json?.error?.message || pres.json?.error?.subMessage || "Failed to start upload.";
    return { ok: false, error: msg };
  }
  const data = pres.json?.data || {};
  const up = await uploadToPresignedUrl({ uploadUrl: data.uploadUrl, file });
  if (!up.ok) return { ok: false, error: "Upload failed. Please try again." };
  return { ok: true, fileUrl: data.fileUrl, key: data.key };
}

export async function registerUser(payload) {
  return await apiPost("/registration", payload);
}

/** Signed GET URL for the current user’s registration docs (private buckets). */
export async function resolveStoredDocumentUrl(fileUrl, opts) {
  const r = await apiPost("/uploads/access-url", { fileUrl: String(fileUrl || "").trim() }, opts);
  if (r.status >= 200 && r.status < 300 && r.json?.ok) return String(r.json?.data?.downloadUrl || "").trim() || null;
  return null;
}

