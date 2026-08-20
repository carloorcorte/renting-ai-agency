import assert from "node:assert/strict";
import { test } from "node:test";
import { isConfirmation, isDecline } from "./guestReply.ts";

test("isConfirmation matches common Italian and English confirmations", () => {
  for (const text of ["sì", "Si!", "OK", "va bene", "Confermo.", "prenoto 👍", "Yes", "confirm"]) {
    assert.equal(isConfirmation(text), true, `expected "${text}" to confirm`);
  }
});

test("isDecline matches common declines", () => {
  for (const text of ["no", "No grazie", "annulla", "cancel"]) {
    assert.equal(isDecline(text), true, `expected "${text}" to decline`);
  }
});

test("an unrelated or ambiguous reply matches neither", () => {
  for (const text of ["quanto costa il parcheggio?", "boh forse", "che ne dici di 3 notti invece?"]) {
    assert.equal(isConfirmation(text), false);
    assert.equal(isDecline(text), false);
  }
});

test("a longer sentence starting with the word doesn't false-match unrelated content", () => {
  // "no" as a substring elsewhere shouldn't match — only a leading token.
  assert.equal(isConfirmation("nonostante tutto va bene"), false);
});
