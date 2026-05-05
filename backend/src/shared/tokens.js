const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function mustEnv(name) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function secondsFromNow(sec) {
  return new Date(Date.now() + Number(sec) * 1000);
}

function parseTtlSeconds(input, fallbackSeconds) {
  const n = Number(input);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return fallbackSeconds;
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function makeSalt(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function hashToken(token, salt) {
  return crypto
    .createHash("sha256")
    .update(`${String(token || "")}:${String(salt || "")}`, "utf8")
    .digest("hex");
}

function verifyTokenHash(token, salt, expectedHash) {
  if (!token || !salt || !expectedHash) return false;
  return hashToken(token, salt) === expectedHash;
}

function signAccessToken(payload, ttlSeconds) {
  const secret = mustEnv("JWT_ACCESS_SECRET");
  return jwt.sign(payload, secret, { expiresIn: ttlSeconds });
}

function verifyAccessToken(token) {
  const secret = mustEnv("JWT_ACCESS_SECRET");
  return jwt.verify(String(token || ""), secret);
}

module.exports = {
  secondsFromNow,
  parseTtlSeconds,
  randomToken,
  makeSalt,
  hashToken,
  verifyTokenHash,
  signAccessToken,
  verifyAccessToken
};

