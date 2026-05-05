const crypto = require("crypto");

function generateNumericOtp(length = 6) {
  const len = Number(length) || 6;
  let s = "";
  for (let i = 0; i < len; i += 1) {
    s += String(crypto.randomInt(0, 10));
  }
  return s;
}

function makeSalt(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashOtp(otp, salt) {
  return crypto
    .createHash("sha256")
    .update(`${String(otp || "")}:${String(salt || "")}`, "utf8")
    .digest("hex");
}

function verifyOtpHash(otp, salt, expectedHash) {
  if (!otp || !salt || !expectedHash) return false;
  return hashOtp(otp, salt) === expectedHash;
}

module.exports = { generateNumericOtp, makeSalt, hashOtp, verifyOtpHash };

