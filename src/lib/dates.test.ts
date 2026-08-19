import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, daysBetween, nights, overlaps, shiftRange, toPgRange } from "./dates.ts";

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
