// Deterministic yes/no gate for a pending booking proposal (see
// PendingProposal in types.ts) — keeps "did the guest actually confirm"
// entirely out of the LLM's hands (design.md: only deterministic code may
// trigger a booking action). A reply that matches neither list just falls
// through to the normal extraction flow instead of being force-classified,
// so an unclear "boh forse" doesn't get silently treated as a decline.
//
// ponytail: a fixed keyword list, not real NLU — covers the actual short
// WhatsApp replies this gets ("sì", "ok", "prenoto"...). Widen the lists (or
// swap for an LLM classification with a forced I_DONT_KNOW-style fallback)
// if guests start replying with phrasing these don't catch.
const CONFIRM_WORDS = [
  "si",
  "sì",
  "ok",
  "okay",
  "va bene",
  "confermo",
  "confermato",
  "prenoto",
  "prenotiamo",
  "procediamo",
  "yes",
  "confirm",
  "book it",
  "deal",
];

const DECLINE_WORDS = ["no", "non voglio", "non piu", "non più", "annulla", "cancel", "no grazie"];

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[!.,👍🎉😊✅❌🙏]+$/gu, "")
    .trim();
}

function matchesAny(text: string, words: string[]): boolean {
  const n = normalize(text);
  return words.some((w) => n === w || n.startsWith(`${w} `) || n.startsWith(`${w},`));
}

export function isConfirmation(text: string): boolean {
  return matchesAny(text, CONFIRM_WORDS);
}

export function isDecline(text: string): boolean {
  return matchesAny(text, DECLINE_WORDS);
}
