const { ok, fail } = require("../../shared/response");
const { fieldsWithRequired } = require("../../shared/csvImport/fieldMeta");
const { ALIASES } = require("../../shared/csvImport/columnAliases");
const { sampleCsvForEntity } = require("../../shared/csvImport/importSampleCsv");
const { requireImportPermission, entityAllowedForRole } = require("./importPermissions");
const { getPermissionsForUser } = require("../../shared/permissions");
const { getRoleCodeForAccount } = require("../../shared/accountRoleProfile");

async function handler(event) {
  const qs = event?.queryStringParameters || {};
  const entityType = String(qs.entityType || qs.entity_type || "").toUpperCase();
  if (!entityType) return fail(400, "VALIDATION_ERROR", "entityType query param is required.");

  const auth = await requireImportPermission(event, entityType);
  if (!auth.ok) return auth.resp;

  const actorId = String(auth.claims?.sub || "");
  const ctx = await getPermissionsForUser(actorId);
  if (!ctx.accountId) return fail(400, "BAD_REQUEST", "account not found");

  const roleCode = await getRoleCodeForAccount(ctx.accountId);
  if (!entityAllowedForRole(entityType, roleCode)) {
    return fail(403, "FORBIDDEN", "This import type is not available for your business profile.");
  }

  const fields = fieldsWithRequired(entityType);
  const headerLine = fields.map((f) => f.key).join(",");
  const aliasKeys = ALIASES[entityType] || {};

  return ok({
    entityType,
    fields,
    csvHeaderLine: headerLine,
    aliases: aliasKeys,
    sampleCsv: sampleCsvForEntity(entityType)
  });
}

module.exports = { handler };
