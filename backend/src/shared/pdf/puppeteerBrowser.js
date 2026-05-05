/**
 * Puppeteer singleton for Lambda / local reuse (reuse warm container browsers).
 */

let browserPromise;

function launchOptions() {
  const execPath = String(process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || "").trim();
  const base = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  };
  return execPath ? { ...base, executablePath: execPath } : base;
}

async function getBrowser() {
  // eslint-disable-next-line global-require
  const puppeteer = require("puppeteer");
  if (!browserPromise) {
    browserPromise = puppeteer.launch(launchOptions()).catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

async function closeBrowser() {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch {
    /* ignore */
  }
  browserPromise = null;
}

process.on("SIGINT", closeBrowser);
process.on("SIGTERM", closeBrowser);

module.exports = { getBrowser };
