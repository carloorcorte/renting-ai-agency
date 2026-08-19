import assert from "node:assert/strict";
import { test } from "node:test";
import { conditionsMatch } from "./rules.ts";

test("empty conditions always match (dates-available is checked separately)", () => {
  assert.equal(conditionsMatch({}, { tripNights: 1 }), true);
});

test("min_nights rejects a shorter trip", () => {
  assert.equal(conditionsMatch({ min_nights: 3 }, { tripNights: 2 }), false);
  assert.equal(conditionsMatch({ min_nights: 3 }, { tripNights: 3 }), true);
});

test("min_price_per_night rejects a lowball offer but accepts silence", () => {
  assert.equal(conditionsMatch({ min_price_per_night: 150 }, { tripNights: 5, guestPrice: 100 }), false);
  assert.equal(conditionsMatch({ min_price_per_night: 150 }, { tripNights: 5, guestPrice: 150 }), true);
  // Guest didn't mention a price at all -> treated as accepting the listed price.
  assert.equal(conditionsMatch({ min_price_per_night: 150 }, { tripNights: 5 }), true);
});

test("multiple conditions are ANDed together", () => {
  const conditions = { min_nights: 3, min_price_per_night: 150 };
  assert.equal(conditionsMatch(conditions, { tripNights: 3, guestPrice: 150 }), true);
  assert.equal(conditionsMatch(conditions, { tripNights: 2, guestPrice: 150 }), false);
  assert.equal(conditionsMatch(conditions, { tripNights: 3, guestPrice: 100 }), false);
});
