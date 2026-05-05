/**
 * User-facing product name for emails and API copy. Technical APP_NAME stays separate (stack identifiers).
 * Set APP_BRAND_NAME in Lambda env / local-server from template StageConfig.BrandDisplayName.
 */

function appBrandDisplayName() {
  const v = String(process.env.APP_BRAND_NAME || "").trim();
  return v || "JedMee";
}

module.exports = { appBrandDisplayName };
