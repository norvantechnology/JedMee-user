const fs = require("fs");
const yaml = require("js-yaml");
const express = require("express");
const cors = require("cors");
const path = require("path");

/** Load `user/backend/.env` before template.yaml so SMTP_* etc. apply withoutcommitting secrets. */
function loadDotEnvFileSync(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // ignore missing or unreadable .env
  }
}

loadDotEnvFileSync(path.join(__dirname, ".env"));

const STAGE = process.env.STAGE || "local";
const PORT = Number(process.env.PORT || 4000);

function jsonFromNodeError(err) {
  const c = err && typeof err === "object" ? String(err.code || "") : "";
  if (
    c === "EAI_AGAIN" ||
    c === "ENOTFOUND" ||
    c === "ECONNREFUSED" ||
    c === "ETIMEDOUT" ||
    c === "ESOCKETTIMEDOUT"
  ) {
    return {
      status: 503,
      payload: {
        ok: false,
        data: null,
        meta: null,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database temporarily unavailable.",
          subMessage: "Check your network connection and try again.",
          details: null
        }
      }
    };
  }
  return null;
}

function cfnTag(name) {
  return ["scalar", "sequence", "mapping"].map((kind) =>
    new yaml.Type("!" + name, {
      kind,
      construct(data) {
        const obj = {};
        obj["Fn::" + name] = data;
        return obj;
      },
    })
  );
}

const cfnNames = [
  "Ref", "Condition", "FindInMap", "GetAtt", "GetAZs", "ImportValue",
  "Join", "Select", "Split", "Sub", "Transform", "And", "Equals",
  "If", "Not", "Or", "Base64", "Cidr", "ToJsonString",
];
const CFN_SCHEMA = yaml.DEFAULT_SCHEMA.extend(cfnNames.flatMap(cfnTag));

const tpl = yaml.load(
  fs.readFileSync(path.join(__dirname, "template.yaml"), "utf8"),
  { schema: CFN_SCHEMA }
);

const stageConfig = tpl.Mappings.StageConfig[STAGE];
if (!stageConfig) {
  console.error(`Stage "${STAGE}" not found in template.yaml Mappings.StageConfig`);
  process.exit(1);
}

process.env.STAGE = STAGE;
process.env.PANEL = "user";
process.env.APP_NAME = stageConfig.AppName;
process.env.APP_BRAND_NAME = String(stageConfig.BrandDisplayName ?? "").trim() || "JedMee";
process.env.DB_HOST = stageConfig.DbHost;
process.env.DB_PORT = stageConfig.DbPort;
process.env.DB_NAME = stageConfig.DbName;
process.env.DB_USER = stageConfig.DbUser;
process.env.DB_PASSWORD = stageConfig.DbPassword;
process.env.DB_SSL = stageConfig.DbSsl;
process.env.BCRYPT_COST = stageConfig.BcryptCost;
process.env.JWT_ACCESS_SECRET = stageConfig.JwtAccessSecret;
process.env.ACCESS_TOKEN_TTL_SECONDS = stageConfig.AccessTokenTtlSeconds;
process.env.REFRESH_TOKEN_TTL_SECONDS = stageConfig.RefreshTokenTtlSeconds;
process.env.REFRESH_TOKEN_TTL_REMEMBER_SECONDS = stageConfig.RefreshTokenTtlRememberSeconds;
function envPreferProcess(key, fallback) {
  const a = String(process.env[key] || "").trim();
  if (a) return a;
  return String(fallback ?? "").trim();
}

process.env.S3_BUCKET = envPreferProcess("S3_BUCKET", stageConfig.S3Bucket);
process.env.S3_REGION = envPreferProcess("S3_REGION", stageConfig.S3Region);
if (!String(process.env.AWS_REGION || "").trim() && process.env.S3_REGION) {
  process.env.AWS_REGION = process.env.S3_REGION;
}
process.env.SMTP_HOST = String(stageConfig.SmtpHost ?? "");
process.env.SMTP_PORT = String(stageConfig.SmtpPort ?? "587");
process.env.SMTP_SECURE = String(stageConfig.SmtpSecure ?? "0");
process.env.SMTP_USER = String(stageConfig.SmtpUser ?? "");
process.env.SMTP_PASS = String(stageConfig.SmtpPass ?? "");
process.env.SMTP_FROM = String(stageConfig.SmtpFrom ?? "");
process.env.EMAIL_VERIFY_OTP_TTL_MINUTES = String(stageConfig.EmailVerifyOtpTtlMinutes ?? "15");
process.env.PASSWORD_RESET_OTP_TTL_MINUTES = String(stageConfig.PasswordResetOtpTtlMinutes ?? "15");
process.env.MEDICO_EMAIL_DRY_RUN = String(stageConfig.MedicoEmailDryRun ?? "").trim();

const routes = [];
for (const [logicalId, resource] of Object.entries(tpl.Resources)) {
  if (resource.Type !== "AWS::Serverless::Function") continue;
  const props = resource.Properties || {};
  const handlerStr = props.Handler;
  if (!handlerStr) continue;
  // Resolve handler relative to the function's CodeUri so local dev mirrors
  // what Lambda sees (e.g. CodeUri: src/, Handler: handlers/router/index.handler
  // → ./src/handlers/router/index.js).
  const codeUri = String(props.CodeUri || ".").replace(/\/+$/, "") || ".";

  const events = props.Events || {};
  for (const evt of Object.values(events)) {
    if (evt.Type !== "Api") continue;
    // SAM uses `{proxy+}` for greedy catch-alls. Express 5 / path-to-regexp v8
    // requires a NAMED wildcard (`/*splat`). `{name}` placeholders become
    // `:name`. Trailing `+` suffix on a literal segment is also reserved by
    // path-to-regexp, so we strip it from the SAM proxy syntax.
    const apiPath = String(evt.Properties.Path || "")
      .replace(/\/?\{proxy\+\}$/g, "/*splat")
      .replace(/\{([^}]+)\}/g, ":$1");
    const rawMethod = String(evt.Properties.Method || "").toLowerCase();
    // SAM `Method: ANY` means "all HTTP verbs" — Express uses `app.all()`.
    const method = rawMethod === "any" ? "all" : rawMethod;
    const idx = handlerStr.lastIndexOf(".");
    const modulePath = path.join(codeUri, handlerStr.substring(0, idx));
    const fnName = handlerStr.substring(idx + 1);
    routes.push({ logicalId, method, apiPath, modulePath, fnName });
  }
}

function routePriorityScore(route) {
  const parts = String(route.apiPath || "").split("/").filter(Boolean);
  const staticCount = parts.filter((p) => !p.startsWith(":")).length;
  const paramCount = parts.length - staticCount;
  return {
    staticCount,
    paramCount,
    depth: parts.length
  };
}

routes.sort((a, b) => {
  // Keep HTTP methods grouped for predictable Express matching.
  if (a.method !== b.method) return a.method.localeCompare(b.method);
  const pa = routePriorityScore(a);
  const pb = routePriorityScore(b);
  // More static segments first (e.g. /check before /:id).
  if (pa.staticCount !== pb.staticCount) return pb.staticCount - pa.staticCount;
  // Fewer params first.
  if (pa.paramCount !== pb.paramCount) return pa.paramCount - pb.paramCount;
  // Deeper paths first (more specific).
  if (pa.depth !== pb.depth) return pb.depth - pa.depth;
  return a.apiPath.localeCompare(b.apiPath);
});

const app = express();
app.use(cors());
app.use(express.json());

for (const route of routes) {
  const mod = require(path.join(__dirname, route.modulePath));
  const handler = mod[route.fnName];
  if (typeof handler !== "function") {
    console.warn(`  SKIP ${route.method.toUpperCase()} ${route.apiPath}  handler not found`);
    continue;
  }

  app[route.method](route.apiPath, async (req, res) => {
    const event = {
      httpMethod: req.method,
      path: req.path,
      headers: req.headers,
      queryStringParameters: req.query,
      pathParameters: req.params || null,
      body: req.body ? JSON.stringify(req.body) : null,
      isBase64Encoded: false,
      requestContext: { stage: STAGE },
    };

    try {
      const result = await handler(event);
      const statusCode = result.statusCode || 200;
      const respHeaders = result.headers || {};
      for (const [k, v] of Object.entries(respHeaders)) {
        res.setHeader(k, v);
      }
      res.status(statusCode).send(result.body || "");
    } catch (err) {
      console.error(`Error in ${route.logicalId}:`, err);
      const mapped = jsonFromNodeError(err);
      if (mapped) {
        res.status(mapped.status).json(mapped.payload);
        return;
      }
      res.status(500).json({
        ok: false,
        data: null,
        meta: null,
        error: {
          code: "INTERNAL",
          message: "Internal server error",
          subMessage: "Please try again.",
          details: null
        }
      });
    }
  });

  console.log(`  ${route.method.toUpperCase().padEnd(6)} ${route.apiPath}  →  ${route.modulePath}.${route.fnName}`);
}

app.listen(PORT, () => {
  console.log(`\nLocal dev server running → http://localhost:${PORT}  (stage: ${STAGE})\n`);
});
