/**
 * In-memory IP-based rate limiter.
 *
 * Works for both local Express dev server and Lambda (per warm instance).
 * For 10-20 users this is sufficient - Lambda instances are reused and
 * a single warm instance handles all traffic at this scale.
 *
 * Usage in a Lambda handler:
 *   const { checkRateLimit } = require('../shared/rateLimiter');
 *   const ip = event.requestContext?.identity?.sourceIp || event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
 *   const limited = checkRateLimit('auth', ip);
 *   if (limited) return fail(429, 'RATE_LIMITED', limited.message);
 *
 * Usage in Express middleware:
 *   app.use('/auth', rateLimitMiddleware('auth'));
 */

// store: Map<windowKey, { count, resetAt }>
const store = new Map();

// Periodically clean up expired entries (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let cleanupTimer = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, CLEANUP_INTERVAL);
  // Don't block process exit
  if (cleanupTimer.unref) cleanupTimer.unref();
}

startCleanup();

/**
 * Rate limit profiles - tuned for 10-20 users.
 * Adjust windowMs / max as needed.
 */
const PROFILES = {
  // Auth endpoints: login, OTP request, registration
  auth: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 20,                    // 20 attempts per IP per 15 min
    message: 'Too many authentication attempts. Please wait 15 minutes and try again.',
  },
  // OTP-specific: stricter (prevent OTP brute-force)
  otp: {
    windowMs: 10 * 60 * 1000,  // 10 minutes
    max: 10,                    // 10 OTP attempts per IP per 10 min
    message: 'Too many OTP attempts. Please wait 10 minutes and try again.',
  },
  // General API: loose limit
  api: {
    windowMs: 60 * 1000,        // 1 minute
    max: 120,                   // 120 requests per IP per minute
    message: 'Too many requests. Please slow down.',
  },
  // Password reset: very strict
  passwordReset: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: 5,                     // 5 reset attempts per IP per hour
    message: 'Too many password reset attempts. Please wait 1 hour.',
  },
};

/**
 * Check rate limit for a given profile and IP.
 * Returns null if allowed, or { message, retryAfterSec } if limited.
 *
 * @param {'auth'|'otp'|'api'|'passwordReset'} profile
 * @param {string} ip
 * @returns {null | { message: string, retryAfterSec: number }}
 */
function checkRateLimit(profile, ip) {
  const cfg = PROFILES[profile] || PROFILES.api;
  const now = Date.now();
  const key = `${profile}:${String(ip || 'unknown')}`;

  let entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + cfg.windowMs };
    store.set(key, entry);
    return null; // first request in window - allowed
  }

  entry.count++;
  if (entry.count > cfg.max) {
    const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
    return { message: cfg.message, retryAfterSec };
  }

  return null; // within limit - allowed
}

/**
 * Express middleware factory.
 * Usage: app.use('/auth', rateLimitMiddleware('auth'))
 *
 * @param {'auth'|'otp'|'api'|'passwordReset'} profile
 */
function rateLimitMiddleware(profile) {
  return function ipRateLimit(req, res, next) {
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    const limited = checkRateLimit(profile, ip);
    if (limited) {
      res.setHeader('Retry-After', String(limited.retryAfterSec));
      res.setHeader('X-RateLimit-Limit', String(PROFILES[profile]?.max || 120));
      return res.status(429).json({
        ok: false,
        data: null,
        meta: null,
        error: {
          code: 'RATE_LIMITED',
          message: limited.message,
          subMessage: `Retry after ${limited.retryAfterSec} seconds.`,
          details: null,
        },
      });
    }

    // Set informational headers
    const cfg = PROFILES[profile] || PROFILES.api;
    const key = `${profile}:${ip}`;
    const entry = store.get(key);
    if (entry) {
      res.setHeader('X-RateLimit-Limit',     String(cfg.max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, cfg.max - entry.count)));
      res.setHeader('X-RateLimit-Reset',     String(Math.ceil(entry.resetAt / 1000)));
    }

    next();
  };
}

/**
 * Extract client IP from a Lambda API Gateway event.
 * Handles both REST API (v1) and HTTP API (v2) event shapes.
 */
function lambdaClientIp(event) {
  // HTTP API v2
  const v2 = event?.requestContext?.http?.sourceIp;
  if (v2) return v2;
  // REST API v1
  const v1 = event?.requestContext?.identity?.sourceIp;
  if (v1) return v1;
  // X-Forwarded-For header (ALB / CloudFront)
  const xff = event?.headers?.['x-forwarded-for'] || event?.headers?.['X-Forwarded-For'] || '';
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

module.exports = { checkRateLimit, rateLimitMiddleware, lambdaClientIp, PROFILES };