const { handlerGet, handlerPatch } = require("./preferences");

async function handler(event) {
  const method = String(event?.httpMethod || "GET").toUpperCase();
  if (method === "PATCH" || method === "POST") return handlerPatch(event);
  return handlerGet(event);
}

module.exports = { handler };
