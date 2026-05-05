const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { created, fail } = require("../../shared/response");
const { query } = require("../../shared/db");
const { parseJsonBody } = require("../../shared/request");
const { requirePermission } = require("../../shared/auth");
const { getPermissionsForUser } = require("../../shared/permissions");
const { normalizeEmail, isEmailLike, normalizeCountryCode, normalizePhoneNumber } = require("../../shared/validation");

function cleanName(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

function genTempPassword() {
  // Generate a cryptographically random 12-character temporary password.
  // Excludes visually ambiguous chars (0/O, 1/l/I) so it is easy to read from email.
  // must_change_password=true forces the user to set their own password on first login.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(12))
    .map((b) => chars[b % chars.length])
    .join("");
}

async function handler(event) {
  const auth = await requirePermission(event, "USERS", "ADD");
  if (!auth.ok) return auth.resp;

  try {
    const creatorId = String(auth.claims?.sub || "");
    const ctx = await getPermissionsForUser(creatorId);
    if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

    const body = parseJsonBody(event);
    const fullName = cleanName(body.fullName);
    const email = normalizeEmail(body.email);
    const phoneCountryCode = normalizeCountryCode(body.phoneCountryCode || body.countryCode || "");
    const phoneNumber = normalizePhoneNumber(body.phoneNumber || "");
    const customRoleId = String(body.customRoleId || "").trim();

    if (!fullName || fullName.length < 2) return fail(400, "VALIDATION_ERROR", "fullName must be at least 2 characters");
    if (!email) return fail(400, "VALIDATION_ERROR", "email is required");
    if (!isEmailLike(email)) return fail(400, "VALIDATION_ERROR", "email is invalid");
    if (!phoneCountryCode || !/^\+\d{1,4}$/.test(String(phoneCountryCode || ""))) {
      return fail(400, "VALIDATION_ERROR", "phoneCountryCode is invalid");
    }
    if (!phoneNumber || !/^\d{7,15}$/.test(String(phoneNumber || ""))) {
      return fail(400, "VALIDATION_ERROR", "phoneNumber must be 7 to 15 digits");
    }
    if (!customRoleId) return fail(400, "VALIDATION_ERROR", "customRoleId is required");

    // Ensure creator's account has a system role to apply to the new user.
    const sysRoleRes = await query(`SELECT role_id FROM app_users WHERE id = $1 LIMIT 1`, [ctx.accountId]);
    const sysRoleId = sysRoleRes.rows[0]?.role_id;
    if (!sysRoleId) return fail(400, "BAD_REQUEST", "system role not found for account");

    const roleRes = await query(`SELECT id FROM user_roles WHERE id = $1 AND account_id = $2 LIMIT 1`, [customRoleId, ctx.accountId]);
    if (!roleRes.rows[0]) return fail(400, "VALIDATION_ERROR", "customRoleId is invalid");

    const dup = await query(`SELECT 1 FROM app_users WHERE email = $1 LIMIT 1`, [email]);
    if (dup.rows[0]) return fail(409, "EMAIL_EXISTS", "Email already registered");

    const dupPhone = await query(
      `SELECT 1 FROM app_users WHERE phone_country_code = $1 AND phone_number = $2 LIMIT 1`,
      [phoneCountryCode, phoneNumber]
    );
    if (dupPhone.rows[0]) return fail(409, "PHONE_EXISTS", "Phone already registered");

    const tempPassword = genTempPassword();
    const cost = Number(process.env.BCRYPT_COST || 12);
    const passwordHash = await bcrypt.hash(tempPassword, cost);

    const ins = await query(
      `
      INSERT INTO app_users (
        account_id,
        created_by_user_id,
        role_id,
        full_name,
        email,
        phone_country_code,
        phone_number,
        password_hash,
        email_verified,
        status,
        is_blocked,
        must_change_password
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'APPROVED',false,true)
      RETURNING id, full_name, email, must_change_password, created_at
      `,
      [ctx.accountId, creatorId, sysRoleId, fullName, email, phoneCountryCode, phoneNumber, passwordHash]
    );

    const user = ins.rows[0];

    await query(
      `
      INSERT INTO user_role_members (user_id, role_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET role_id = EXCLUDED.role_id
      `,
      [user.id, customRoleId]
    );

    // Email send is mocked for now (no SMTP configured).
    // In production, wire this to SES/SMTP and remove password from response.
    return created(
      {
        user
      },
      {
        message: "User created. Temporary password generated and should be emailed.",
        tempPassword: String(process.env.STAGE || "").toLowerCase() === "local" ? tempPassword : null
      }
    );
  } catch (e) {
    const msg = e && typeof e === "object" ? String(e.message || "") : "";
    if (msg.includes("app_users_email_key")) return fail(409, "EMAIL_EXISTS", "Email already registered");
    if (msg.includes("app_users_phone_key")) return fail(409, "PHONE_EXISTS", "Phone already registered");
    return fail(500, "INTERNAL_ERROR", "internal_error");
  }
}

module.exports = { handler };

