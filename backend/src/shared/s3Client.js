const { S3Client } = require("@aws-sdk/client-s3");
const { RequestChecksumCalculation } = require("@aws-sdk/middleware-flexible-checksums");

function missingEnv(name) {
  const e = new Error(`${name} is required`);
  e.code = "MISSING_ENV";
  e.details = { name };
  return e;
}

function getS3Region() {
  return String(process.env.S3_REGION || process.env.AWS_REGION || "").trim();
}

function getBucket() {
  return String(process.env.S3_BUCKET || "").trim();
}

function getS3Client() {
  const region = getS3Region();
  if (!region) throw missingEnv("S3_REGION or AWS_REGION");
  /*
   * Default SDK behaviour is WHEN_SUPPORTED, which adds CRC32 query params to presigned PUT URLs.
   * Browsers cannot satisfy those reliably → S3 returns 403. WHEN_REQUIRED keeps SigV4 + UNSIGNED-PAYLOAD
   * uploads compatible with fetch(uploadUrl, { method: "PUT", body: file, headers: { "content-type": … } }).
   */
  return new S3Client({
    region,
    requestChecksumCalculation: RequestChecksumCalculation.WHEN_REQUIRED
  });
}

module.exports = { getS3Client, getBucket, getS3Region, missingEnv };
