const crypto = require("crypto");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { getS3Client, getBucket, getS3Region } = require("../../shared/s3Client");

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",                                                     // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" // .docx
]);
const ALLOWED_DOC_TYPES = new Set(["GST_CERTIFICATE", "DRUG_LICENSE_1", "DRUG_LICENSE_2"]);

function safeBaseName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

async function handler(event) {
  try {
    const body = parseJsonBody(event);
    const docType = String(body.docType || "").trim().toUpperCase();
    const contentType = String(body.contentType || "").trim().toLowerCase();
    const originalName = String(body.originalName || "").trim();

    if (!docType) return fail(400, "VALIDATION_ERROR", "docType is required");
    if (!ALLOWED_DOC_TYPES.has(docType)) return fail(400, "VALIDATION_ERROR", "docType is invalid");
    if (!contentType) return fail(400, "VALIDATION_ERROR", "contentType is required");
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) return fail(400, "VALIDATION_ERROR", "contentType is not allowed");

    const bucket = getBucket();
    const region = getS3Region();
    if (!bucket || !region) {
      return fail(503, "SERVICE_UNAVAILABLE", "File uploads are not configured (missing S3 bucket or region).");
    }

    const ext =
      contentType === "image/png"  ? "png"
      : contentType === "image/gif"  ? "gif"
      : contentType === "image/webp" ? "webp"
      : contentType === "application/pdf" ? "pdf"
      : contentType === "application/msword" ? "doc"
      : contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ? "docx"
      : "jpg";

    const id = crypto.randomUUID();
    const namePart = safeBaseName(originalName || docType);
    const key = `user-registration/${docType}/${id}-${namePart || docType}.${ext}`;

    const s3 = getS3Client();
    // NOTE: ContentType is intentionally NOT included in the signed command.
    // Including it would require the browser to send a Content-Type header on the
    // presigned PUT, which triggers a CORS preflight to S3. By omitting it from
    // the signature, the browser can PUT without custom headers (no preflight).
    // The actual content-type is still validated here before generating the URL.
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const uploadUrl = await getSignedUrl(s3, cmd, {
      expiresIn: 300, // 5 minutes
      unhoistableHeaders: new Set(["content-type"])
    });
    const fileUrl = `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(key).replace(/%2F/g, "/")}`;

    return ok(
      {
        docType,
        key,
        uploadUrl,
        fileUrl,
        expiresInSec: 300
      },
      { message: "Upload URL generated." }
    );
  } catch (e) {
    if (e && e.code === "MISSING_ENV") {
      return fail(500, "SERVER_MISCONFIG", `Server misconfigured: ${e.message}`, e.details);
    }
    return fail(500, "SERVER_ERROR", "Failed to generate upload URL");
  }
}

module.exports = { handler };

