"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isFutureDate } = require("../src/shared/sales");
const { ensureDateNotFuture } = require("../src/shared/purchase");
const { todayYmdInTimeZone } = require("../src/shared/timezone");

const IST = "Asia/Kolkata";

function addDays(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// Regression: at ~01:00 IST the server (UTC) date is still "yesterday".
// The user's real "today" in IST must NOT be treated as a future date.
test("isFutureDate: IST today is allowed via timeZone option", () => {
  const istToday = todayYmdInTimeZone(IST);
  assert.equal(isFutureDate(istToday, { timeZone: IST }), false);
});

test("isFutureDate: IST today is allowed via clientTodayYmd", () => {
  const istToday = todayYmdInTimeZone(IST);
  assert.equal(isFutureDate(istToday, { clientTodayYmd: istToday }), false);
});

test("isFutureDate: with no hint, slack fallback still allows IST today", () => {
  // Worst case: client sends nothing. The +1 day slack covers timezone skew.
  const istToday = todayYmdInTimeZone(IST);
  assert.equal(isFutureDate(istToday, {}), false);
});

test("isFutureDate: clearly future dates are still rejected", () => {
  const istToday = todayYmdInTimeZone(IST);
  assert.equal(isFutureDate(addDays(istToday, 3), { timeZone: IST }), true);
});

test("ensureDateNotFuture (purchase): IST today is allowed", () => {
  const istToday = todayYmdInTimeZone(IST);
  assert.equal(ensureDateNotFuture(istToday, "Invoice date", { timeZone: IST }), "");
});

test("ensureDateNotFuture (purchase): future date is rejected", () => {
  const istToday = todayYmdInTimeZone(IST);
  const msg = ensureDateNotFuture(addDays(istToday, 3), "Invoice date", { timeZone: IST });
  assert.match(msg, /future/);
});
