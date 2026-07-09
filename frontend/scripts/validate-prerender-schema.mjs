/**
 * Post-prerender JSON-LD validation.
 * Fails the build if expected schema types are missing from static HTML.
 * Writes frontend/dist/prerender-schema-report.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../dist");
const SITE = "https://jedmee.com";

const ROUTES = [
  {
    path: "/",
    outFile: "index.html",
    url: `${SITE}/`,
    requiredTypes: ["Organization", "WebSite", "WebPage", "SoftwareApplication", "FAQPage", "Product", "AggregateOffer", "Review"],
  },
  {
    path: "/about",
    outFile: "about/index.html",
    url: `${SITE}/about`,
    requiredTypes: ["AboutPage", "Person", "Review", "AggregateRating", "BreadcrumbList"],
  },
  {
    path: "/contact",
    outFile: "contact/index.html",
    url: `${SITE}/contact`,
    requiredTypes: ["ContactPage", "BreadcrumbList", "FAQPage"],
  },
  {
    path: "/terms",
    outFile: "terms/index.html",
    url: `${SITE}/terms`,
    requiredTypes: ["WebPage", "BreadcrumbList"],
  },
  {
    path: "/pharmacy-management-software",
    outFile: "pharmacy-management-software/index.html",
    url: `${SITE}/pharmacy-management-software`,
    requiredTypes: ["Article", "WebPage", "BreadcrumbList", "FAQPage", "SoftwareApplication", "Service"],
  },
  {
    path: "/pharmacy-billing-guide",
    outFile: "pharmacy-billing-guide/index.html",
    url: `${SITE}/pharmacy-billing-guide`,
    requiredTypes: ["Article", "WebPage", "BreadcrumbList", "FAQPage", "SoftwareApplication", "HowTo", "Service"],
  },
  {
    path: "/pharmacy-inventory-guide",
    outFile: "pharmacy-inventory-guide/index.html",
    url: `${SITE}/pharmacy-inventory-guide`,
    requiredTypes: ["Article", "WebPage", "BreadcrumbList", "FAQPage", "SoftwareApplication", "HowTo", "Service"],
  },
  {
    path: "/pharmacy-software-comparison",
    outFile: "pharmacy-software-comparison/index.html",
    url: `${SITE}/pharmacy-software-comparison`,
    requiredTypes: ["Article", "WebPage", "BreadcrumbList", "FAQPage", "SoftwareApplication", "Service"],
  },
  {
    path: "/wholesale-pharmacy-software",
    outFile: "wholesale-pharmacy-software/index.html",
    url: `${SITE}/wholesale-pharmacy-software`,
    requiredTypes: ["Article", "WebPage", "BreadcrumbList", "FAQPage", "SoftwareApplication", "Service"],
  },
  {
    path: "/pharmacy-mobile-app",
    outFile: "pharmacy-mobile-app/index.html",
    url: `${SITE}/pharmacy-mobile-app`,
    requiredTypes: ["Article", "WebPage", "BreadcrumbList", "FAQPage", "SoftwareApplication", "Service"],
  },
  {
    path: "/free-trial",
    outFile: "free-trial/index.html",
    url: `${SITE}/free-trial`,
    requiredTypes: ["Article", "WebPage", "BreadcrumbList", "FAQPage", "SoftwareApplication"],
  },
  {
    path: "/multi-user-pharmacy-software",
    outFile: "multi-user-pharmacy-software/index.html",
    url: `${SITE}/multi-user-pharmacy-software`,
    requiredTypes: ["Article", "WebPage", "BreadcrumbList", "FAQPage", "SoftwareApplication", "Service"],
  },
  {
    path: "/retail-wholesale-pharmacy",
    outFile: "retail-wholesale-pharmacy/index.html",
    url: `${SITE}/retail-wholesale-pharmacy`,
    requiredTypes: ["Article", "WebPage", "BreadcrumbList", "FAQPage", "SoftwareApplication", "Service"],
  },
  {
    path: "/pharmacy-financial-management",
    outFile: "pharmacy-financial-management/index.html",
    url: `${SITE}/pharmacy-financial-management`,
    requiredTypes: ["Article", "WebPage", "BreadcrumbList", "FAQPage", "SoftwareApplication", "HowTo", "Service"],
  },
];

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch {
      blocks.push(null);
    }
  }
  return blocks.filter(Boolean);
}

function collectTypes(node, types = new Set()) {
  if (!node || typeof node !== "object") return types;
  if (Array.isArray(node)) {
    node.forEach((item) => collectTypes(item, types));
    return types;
  }
  if (node["@type"]) {
    const t = node["@type"];
    if (Array.isArray(t)) t.forEach((x) => types.add(x));
    else types.add(t);
  }
  Object.values(node).forEach((v) => collectTypes(v, types));
  return types;
}

function countTypeOccurrences(blocks, typeName) {
  let count = 0;
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const t = node["@type"];
    if (t === typeName || (Array.isArray(t) && t.includes(typeName))) count += 1;
    Object.values(node).forEach(walk);
  };
  blocks.forEach(walk);
  return count;
}

async function validateRoute(route) {
  const filePath = path.join(DIST_DIR, route.outFile);
  let html;
  try {
    html = await fs.readFile(filePath, "utf8");
  } catch {
    return {
      url: route.url,
      path: route.path,
      ok: false,
      error: `Missing prerender file: dist/${route.outFile}`,
      typesFound: [],
      missing: route.requiredTypes,
    };
  }

  const blocks = extractJsonLdBlocks(html);
  if (blocks.length === 0) {
    return {
      url: route.url,
      path: route.path,
      ok: false,
      error: "No application/ld+json blocks found",
      typesFound: [],
      missing: route.requiredTypes,
      blockCount: 0,
    };
  }

  const types = new Set();
  blocks.forEach((b) => collectTypes(b, types));
  const typesFound = [...types].sort();
  const missing = route.requiredTypes.filter((req) => !types.has(req));

  // Home needs at least 4 Product blocks (one per plan)
  const extraErrors = [];
  if (route.path === "/" && countTypeOccurrences(blocks, "Product") < 4) {
    extraErrors.push(
      `Expected ≥4 Product schemas, found ${countTypeOccurrences(blocks, "Product")}`
    );
  }

  return {
    url: route.url,
    path: route.path,
    ok: missing.length === 0 && extraErrors.length === 0,
    typesFound,
    missing,
    blockCount: blocks.length,
    errors: extraErrors,
  };
}

async function main() {
  console.log("\nValidating prerendered JSON-LD…\n");
  const results = [];
  for (const route of ROUTES) {
    results.push(await validateRoute(route));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    routes: results,
  };

  const reportPath = path.join(DIST_DIR, "prerender-schema-report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("URL | Schema types found | Status");
  console.log("-".repeat(72));
  for (const r of results) {
    const status = r.ok ? "OK" : "FAIL";
    console.log(`${r.url}`);
    console.log(`  types: ${r.typesFound.join(", ") || "(none)"}`);
    console.log(`  blocks: ${r.blockCount ?? 0} | status: ${status}`);
    if (r.missing?.length) console.log(`  missing: ${r.missing.join(", ")}`);
    if (r.error) console.log(`  error: ${r.error}`);
    if (r.errors?.length) r.errors.forEach((e) => console.log(`  error: ${e}`));
    console.log("");
  }
  console.log(`Report written to dist/prerender-schema-report.json\n`);

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`Schema validation failed for ${failed.length} route(s).`);
    process.exit(1);
  }
  console.log("All prerendered pages contain expected JSON-LD schema types.");
}

main().catch((err) => {
  console.error("Schema validation error:", err.message);
  process.exit(1);
});
