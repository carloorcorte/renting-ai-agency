import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, daysBetween, monthGrid, nights, normalizeIsoDate, overlaps, shiftRange, toPgRange } from "./dates.ts";

test("overlaps detects shared nights but not touching ranges", () => {
  const a = { checkin: "2026-08-01", checkout: "2026-08-08" };
  assert.equal(overlaps(a, { checkin: "2026-08-05", checkout: "2026-08-10" }), true);
  // Checkout day == next checkin day is a valid back-to-back booking, not an overlap.
  assert.equal(overlaps(a, { checkin: "2026-08-08", checkout: "2026-08-12" }), false);
  assert.equal(overlaps(a, { checkin: "2026-07-20", checkout: "2026-08-01" }), false);
});

test("nights counts whole days between checkin and checkout", () => {
  assert.equal(nights({ checkin: "2026-08-01", checkout: "2026-08-08" }), 7);
});

test("shiftRange moves both ends by the same number of days", () => {
  const shifted = shiftRange({ checkin: "2026-08-01", checkout: "2026-08-08" }, 7);
  assert.deepEqual(shifted, { checkin: "2026-08-08", checkout: "2026-08-15" });
});

test("addDays handles month rollover", () => {
  assert.equal(addDays("2026-08-28", 5), "2026-09-02");
});

test("daysBetween is the inverse of addDays", () => {
  assert.equal(daysBetween("2026-08-01", addDays("2026-08-01", 13)), 13);
});

test("toPgRange formats as a half-open Postgres daterange literal", () => {
  assert.equal(toPgRange({ checkin: "2026-08-01", checkout: "2026-08-08" }), "[2026-08-01,2026-08-08)");
});

test("normalizeIsoDate passes through an already-ISO date unchanged", () => {
  assert.equal(normalizeIsoDate("2026-08-24"), "2026-08-24");
});

test("normalizeIsoDate repairs a verbose Date.toString()-style value", () => {
  // What an LLM sent when it ignored the "plain YYYY-MM-DD" rule — see
  // extractInquiryDetails in llm.ts.
  assert.equal(normalizeIsoDate("Mon Aug 24 2026 00:00:00 GMT+0000 (Coordinated Universal Time)"), "2026-08-24");
});

test("normalizeIsoDate rejects ambiguous formats rather than guess", () => {
  assert.equal(normalizeIsoDate("24/08/2026"), null);
  assert.equal(normalizeIsoDate("not a date"), null);
});

test("monthGrid returns 42 days starting on the Monday on/before the 1st", () => {
  // August 2026 starts on a Saturday.
  const grid = monthGrid(2026, 8);
  assert.equal(grid.length, 42);
  assert.equal(grid[0], "2026-07-27"); // Monday before Aug 1
  assert.equal(grid.includes("2026-08-01"), true);
  assert.equal(grid.includes("2026-08-31"), true);
});

test("monthGrid handles a month that starts on Monday with no lead-in days", () => {
  // June 2026 starts on a Monday.
  const grid = monthGrid(2026, 6);
  assert.equal(grid[0], "2026-06-01");
});
