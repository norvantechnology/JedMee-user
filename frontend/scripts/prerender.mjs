/**
 * Post-build prerender for JedMee public SEO pages.
 * Visits each route in headless Chromium and writes static HTML so crawlers
 * see title, meta, and JSON-LD without executing React.
 *
 * Output:
 *   dist/index.html          (/)
 *   dist/about/index.html
 *   dist/contact/index.html
 *   dist/terms/index.html
 */
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../dist");
const FRONTEND_DIR = path.resolve(__dirname, "..");

const PUBLIC_ROUTES = [
  { path: "/about", outFile: "about/index.html" },
  { path: "/contact", outFile: "contact/index.html" },
  { path: "/terms", outFile: "terms/index.html" },
  { path: "/pharmacy-management-software", outFile: "pharmacy-management-software/index.html" },
  { path: "/pharmacy-billing-guide", outFile: "pharmacy-billing-guide/index.html" },
  { path: "/pharmacy-inventory-guide", outFile: "pharmacy-inventory-guide/index.html" },
  { path: "/pharmacy-software-comparison", outFile: "pharmacy-software-comparison/index.html" },
  { path: "/wholesale-pharmacy-software", outFile: "wholesale-pharmacy-software/index.html" },
  { path: "/pharmacy-mobile-app", outFile: "pharmacy-mobile-app/index.html" },
  { path: "/free-trial", outFile: "free-trial/index.html" },
  { path: "/multi-user-pharmacy-software", outFile: "multi-user-pharmacy-software/index.html" },
  { path: "/retail-wholesale-pharmacy", outFile: "retail-wholesale-pharmacy/index.html" },
  { path: "/pharmacy-financial-management", outFile: "pharmacy-financial-management/index.html" },
  // Homepage last — vite preview serves dist/index.html as the SPA shell for all routes.
  // Prerendering / first would bake homepage JSON-LD into that shell and pollute other pages.
  { path: "/", outFile: "index.html" },
];

function findFreePort(startPort = 4173, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let port = startPort;

    const tryPort = () => {
      const probe = net.createServer();
      probe.once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          port += 1;
          if (port >= startPort + maxAttempts) {
            reject(new Error(`No free port between ${startPort} and ${startPort + maxAttempts - 1}`));
          } else {
            tryPort();
          }
          return;
        }
        reject(err);
      });
      probe.once("listening", () => {
        probe.close(() => resolve(port));
      });
      probe.listen(port, "127.0.0.1");
    };

    tryPort();
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
        // server not ready yet
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Preview server did not start within ${timeoutMs}ms (${url})`));
      }
      setTimeout(tick, 300);
    };
    tick();
  });
}

async function ensureDistExists() {
  try {
    await fs.access(path.join(DIST_DIR, "index.html"));
  } catch {
    throw new Error("dist/index.html not found — run vite build first");
  }
}

async function startPreview(port) {
  const baseUrl = `http://127.0.0.1:${port}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (message) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    const child = spawn(
      "npx",
      ["vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
      {
        cwd: FRONTEND_DIR,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, BROWSER: "none" },
      }
    );

    child.stdout.on("data", (d) => process.stdout.write(d));
    child.stderr.on("data", (d) => {
      const text = d.toString();
      process.stderr.write(d);
      if (/already in use|EADDRINUSE/i.test(text)) {
        fail(`Port ${port} is already in use — stop other preview servers (e.g. npm run preview) and retry`);
      }
    });

    child.on("error", (err) => fail(`Failed to start preview server: ${err.message}`));
    child.on("exit", (code, signal) => {
      if (!settled && code !== 0) {
        fail(`Preview server exited before ready (code=${code ?? "null"}, signal=${signal ?? "null"})`);
      }
    });

    // Prevent open stdio pipes from keeping Node alive after we kill the server
    child.unref();

    waitForServer(`${baseUrl}/`)
      .then(() => {
        if (settled) return;
        settled = true;
        console.log(`  Preview server ready at ${baseUrl}`);
        resolve({ child, baseUrl });
      })
      .catch(fail);
  });
}

async function writeRouteHtml(page, baseUrl, route) {
  const url = `${baseUrl}${route.path}`;
  const canonical = route.path === "/" ? `${baseUrl}/` : `${baseUrl}${route.path}`;

  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

  await page
    .waitForFunction(
      (expected) => {
        const link = document.querySelector('link[rel="canonical"]');
        return link && link.href === expected;
      },
      canonical,
      { timeout: 20000 }
    )
    .catch(() => {});

  await page
    .waitForSelector('script[data-page-schema="true"]', { timeout: 20000 })
    .catch(() => page.waitForTimeout(2500));
  await page.waitForTimeout(400);

  const html = await page.content();
  const outPath = path.join(DIST_DIR, route.outFile);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, html, "utf8");

  const title = await page.title();
  console.log(`  ✓ ${route.path} → dist/${route.outFile} (title: "${title}")`);

  if (!title || title.trim().length === 0) {
    throw new Error(`Prerender produced empty <title> for ${route.path}`);
  }
}

async function stopPreview(child) {
  if (!child || child.exitCode !== null) return;

  return new Promise((resolve) => {
    const forceKill = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already exited */
      }
      resolve();
    }, 5000);

    child.once("exit", () => {
      clearTimeout(forceKill);
      resolve();
    });

    child.stdout?.destroy?.();
    child.stderr?.destroy?.();
    child.kill("SIGTERM");
  });
}

async function main() {
  console.log("Prerendering public routes...");
  await ensureDistExists();

  // Keep a clean SPA shell (no route-specific JSON-LD) for preview while prerendering subpages.
  const shellPath = path.join(DIST_DIR, "index.html");
  const cleanShellHtml = await fs.readFile(shellPath, "utf8");

  const port = await findFreePort();
  const { child: preview, baseUrl } = await startPreview(port);
  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    for (const route of PUBLIC_ROUTES) {
      if (route.path !== "/") {
        await fs.writeFile(shellPath, cleanShellHtml, "utf8");
      }
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await writeRouteHtml(page, baseUrl, route);
      } finally {
        await context.close();
      }
    }

    console.log("Prerender complete.");
  } finally {
    if (browser) await browser.close();
    await stopPreview(preview);
  }

  // Validate JSON-LD in prerendered HTML (fails build on missing schema)
  const { spawnSync } = await import("node:child_process");
  const validate = spawnSync("node", ["scripts/validate-prerender-schema.mjs"], {
    cwd: FRONTEND_DIR,
    stdio: "inherit",
  });
  if (validate.status !== 0) {
    process.exit(validate.status ?? 1);
  }
}

async function mainWrapper() {
  await main();
}

mainWrapper().catch((err) => {
  console.error("Prerender failed:", err.message);
  process.exit(1);
});
