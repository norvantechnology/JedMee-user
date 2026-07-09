const { runDailyLowStockDigest } = require("../../shared/jobs/lowStockDailyDigest");
const { runInventoryCriticalAlertsAllAccounts } = require("../../shared/jobs/inventoryCriticalAlerts");
const { runNotificationEmailDigest } = require("../../shared/jobs/notificationEmailDigest");

/**
 * Scheduled Lambda (EventBridge). No HTTP auth - protect with IAM / SAM schedule only.
 * Runs: low-stock digest, inventory/payment critical alerts, optional email digest.
 */
async function handler(event) {
  try {
    const lowStock = await runDailyLowStockDigest();
    const inventory = await runInventoryCriticalAlertsAllAccounts();
    const email = await runNotificationEmailDigest();
    const summary = { lowStock, inventory, email };
    console.log("[notifications:dailyDigest]", summary, event?.version || "");
    return summary;
  } catch (e) {
    console.error("[notifications:dailyDigest]", e);
    throw e;
  }
}

module.exports = { handler };
