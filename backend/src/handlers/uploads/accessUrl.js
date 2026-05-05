const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { ok, fail } = require("../../shared/response");
const { parseJsonBody } = require("../../shared/request");
const { requireAuth } = require("../../shared/auth");
const { query } = require("../../shared/db");
const { getS3Client, getBucket, getS3Region } = require("../../shared/s3Client");
const { extractS3KeyFromObjectUrl, isRegistrationUploadKey } = require("../../shared/s3Keys");

const GET_EXPIRES_SEC = 600;

async function handler(event) {
  const auth = requireAuth(event);
  if (!auth.ok) return auth.resp;

  const body = parseJsonBody(event);
  let key = String(body.key || "").trim();
  const fileUrl = String(body.fileUrl || "").trim();

  const bucket = getBucket();
  const region = getS3Region();
  if (!bucket || !region) {
    return fail(503, "SERVICE_UNAVAILABLE", "File storage is not configured.");
  }

  if (!key && fileUrl) key = extractS3KeyFromObjectUrl(fileUrl, bucket);
  if (!isRegistrationUploadKey(key)) {
    return fail(400, "VALIDATION_ERROR", "Invalid or unsupported file reference.");
  }

  const userId = String(auth.claims?.sub || "");
  if (!userId) return fail(401, "UNAUTHORIZED", "Invalid access token.");

  const ur = await query(
    `
    SELECT gst_certificate_url, drug_license_1_url, drug_license_2_url
    FROM app_users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );
  const row = ur.rows[0] || null;
  if (!row) return fail(404, "NOT_FOUND", "User not found.");

  const urls = [row.gst_certificate_url, row.drug_license_1_url, row.drug_license_2_url].filter(Boolean);
  const allowed = urls.some((u) => extractS3KeyFromObjectUrl(String(u), bucket) === key);
  if (!allowed) return fail(403, "FORBIDDEN", "You do not have access to this file.");

  try {
    const s3 = getS3Client();
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const downloadUrl = await getSignedUrl(s3, cmd, { expiresIn: GET_EXPIRES_SEC });
    return ok({ downloadUrl, key, expiresInSec: GET_EXPIRES_SEC }, { message: "Download URL issued." });
  } catch (e) {
    if (e && e.code === "MISSING_ENV") {
      return fail(500, "SERVER_MISCONFIG", `Server misconfigured: ${e.message}`, e.details);
    }
    return fail(500, "SERVER_ERROR", "Could not prepare download URL.");
  }
}

module.exports = { handler };
