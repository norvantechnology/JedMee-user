"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveClientTimeZone,
  todayYmdInTimeZone,
  todayYmdFromOffsetMinutes,
  utcBoundsForLocalDate,
  parseOffsetMinutes
} = require("../src/shared/timezone");

test("resolveClientTimeZone prefers IANA timezone param", () => {
  assert.equal(resolveClientTimeZone({ timezone: "Asia/Kolkata" }), "Asia/Kolkata");
  assert.equal(resolveClientTimeZone({ tz: "America/New_York" }), "America/New_York");
});

test("resolveClientTimeZone builds offset label from minutes", () => {
  assert.equal(resolveClientTimeZone({ tz_offset_minutes: 330 }), "UTC+05:30");
  assert.equal(resolveClientTimeZone({ tz_offset_minutes: -300 }), "UTC-05:00");
});

test("todayYmdFromOffsetMinutes matches IST calendar", () => {
  const ist = todayYmdFromOffsetMinutes(330);
  const kolkata = todayYmdInTimeZone("Asia/Kolkata");
  assert.equal(ist, kolkata);
});

test("utcBoundsForLocalDate covers full local day for offset zone", () => {
  const { startUtc, endUtc } = utcBoundsForLocalDate("2026-05-15", "UTC+05:30");
  assert.ok(startUtc);
  assert.ok(endUtc);
  assert.equal(startUtc.includes("2026-05-14"), true);
  assert.equal(endUtc.includes("2026-05-15"), true);
});

test("parseOffsetMinutes", () => {
  assert.equal(parseOffsetMinutes("UTC+5:30"), 330);
  assert.equal(parseOffsetMinutes("UTC"), 0);
});
