const { runDailyLowStockDigest } = require("../../shared/jobs/lowStockDailyDigest");

/**
 * Scheduled Lambda (EventBridge). No HTTP auth  protect with IAM / SAM schedule only.
 */
async function handler(event) {
  try {
    const summary = await runDailyLowStockDigest();
    console.log("[notifications:dailyDigest]", summary, event?.version || "");
    return summary;
  } catch (e) {
    console.error("[notifications:dailyDigest]", e);
    throw e;
  }
}

module.exports = { handler };
