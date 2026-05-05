/**
 * Parse object keys from stored HTTPS URLs (virtual-hosted and path-style).
 */

function extractS3KeyFromObjectUrl(url, bucketName) {
  const bucket = String(bucketName || "").trim();
  const raw = String(url || "").trim();
  if (!raw || !bucket) return "";

  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    let path = u.pathname.replace(/^\/+/, "");

    // Virtual-hosted: <bucket>.s3.<region>.amazonaws.com/<key>
    if (host === `${bucket}.s3.amazonaws.com` || host.startsWith(`${bucket}.s3.`)) {
      return decodeURIComponent(path).replace(/^\/+/, "");
    }

    // Path-style: s3.<region>.amazonaws.com/<bucket>/<key>
    if (host.startsWith("s3.") && host.endsWith(".amazonaws.com") && host !== "s3.amazonaws.com") {
      const cut = path.indexOf("/");
      if (cut < 0) return "";
      const maybeBucket = path.slice(0, cut);
      const rest = path.slice(cut + 1);
      if (maybeBucket !== bucket) return "";
      return decodeURIComponent(rest).replace(/^\/+/, "");
    }

    // Fallback: pathname only (best-effort)
    return decodeURIComponent(path).replace(/^\/+/, "");
  } catch {
    return "";
  }
}

function isRegistrationUploadKey(key) {
  const k = String(key || "").trim();
  if (!k || k.length > 900) return false;
  if (k.includes("..") || k.startsWith("/")) return false;
  return k.startsWith("user-registration/");
}

module.exports = { extractS3KeyFromObjectUrl, isRegistrationUploadKey };
