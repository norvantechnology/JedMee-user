"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveAnalyticsDay } = require("../src/shared/dateFilters");

test("resolveAnalyticsDay prefers explicit date", () => {
  const r = resolveAnalyticsDay(
    { date: "2026-05-15", timezone: "Asia/Kolkata" },
    { timeZone: "Asia/Kolkata" }
  );
  assert.equal(r.day, "2026-05-15");
  assert.equal(r.source, "date");
});

test("resolveAnalyticsDay uses single-day range from client", () => {
  const r = resolveAnalyticsDay({
    dateFrom: "2026-05-20",
    dateTo: "2026-05-20",
    tz_offset_minutes: 330
  });
  assert.equal(r.day, "2026-05-20");
  assert.equal(r.source, "range");
});

test("resolveAnalyticsDay uses calendar today when range spans multiple days", () => {
  const r = resolveAnalyticsDay({
    dateFrom: "2026-05-01",
    dateTo: "2026-05-31",
    timezone: "UTC+05:30"
  });
  const { todayYmdInTimeZone } = require("../src/shared/timezone");
  assert.equal(r.day, todayYmdInTimeZone("UTC+05:30"));
  assert.equal(r.source, "today");
});
