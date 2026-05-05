const { ok } = require("../shared/response");
const { appBrandDisplayName } = require("../shared/brand");

async function handler() {
  return ok({
    panel: process.env.PANEL || "user",
    message: `Hello from ${appBrandDisplayName()} user backend`,
    app: process.env.APP_NAME || "medico-user-backend",
    stage: process.env.STAGE || "local"
  });
}

module.exports = { handler };

