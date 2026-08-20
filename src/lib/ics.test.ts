import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIcs } from "./ics.ts";

test("buildIcs emits one VEVENT per booking with correct all-day dates", () => {
  const ics = buildIcs("Casa Ibiza", [
    { id: "abc", property_name: "Villa Sunset", guest_name: "Jane Doe", checkin: "2026-08-24", checkout: "2026-08-28", status: "confirmed" },
  ]);
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260824\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20260828\r\n/);
  assert.match(ics, /SUMMARY:Villa Sunset — Jane Doe\r\n/);
  assert.match(ics, /STATUS:CONFIRMED\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});

test("buildIcs escapes commas and semicolons in free text", () => {
  const ics = buildIcs("Host, Inc; Villas", [
    { id: "1", property_name: "A, B; C", guest_name: "", checkin: "2026-01-01", checkout: "2026-01-02", status: "inquiry" },
  ]);
  assert.match(ics, /X-WR-CALNAME:Host\\, Inc\\; Villas — Bookings/);
  assert.match(ics, /SUMMARY:A\\, B\\; C — Guest/);
  assert.match(ics, /STATUS:TENTATIVE/);
});

test("buildIcs with no bookings still produces a valid empty calendar", () => {
  const ics = buildIcs("Empty Host", []);
  assert.match(ics, /BEGIN:VCALENDAR[\s\S]*END:VCALENDAR/);
  assert.equal(ics.includes("BEGIN:VEVENT"), false);
});
