/**
 * PUT a file to an S3 presigned URL.
 *
 * Content-Type is intentionally NOT sent as a request header.
 * The presign handler no longer includes ContentType in the signed command,
 * so omitting the header here avoids the CORS preflight OPTIONS request that
 * S3 would otherwise require (PUT + Content-Type header = non-simple request).
 * Without a preflight, the upload works from any origin without S3 CORS config.
 */
export async function uploadToPresignedUrl({ uploadUrl, file }) {
  try {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      body: file
      // No Content-Type header - avoids CORS preflight to S3
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    // Network error or CORS block
    console.error("[uploadToPresignedUrl] fetch failed:", err);
    return { ok: false, status: 0, error: String(err?.message || err) };
  }
}

