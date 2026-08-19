import Anthropic from "@anthropic-ai/sdk";
import type { AlternativeWindow } from "./bookings.ts";
import { type DateRange, todayISO } from "./dates.ts";
import type { Property, PropertyMatch } from "./types.ts";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// Small/cheap model: both jobs below are short, grounded, single-turn tasks.
const MODEL = "claude-haiku-4-5-20251001";

export interface InquiryExtraction {
  propertyName: string | null;
  checkin: string | null; // YYYY-MM-DD
  checkout: string | null; // YYYY-MM-DD
  guestPrice: number | null;
}

const EXTRACTION_TOOL = {
  name: "record_inquiry_details",
  description: "Record the structured details found in a guest's WhatsApp message.",
  input_schema: {
    type: "object" as const,
    properties: {
      propertyName: {
        type: ["string", "null"],
        description: "Exact property name mentioned by the guest, or null if none was named.",
      },
      checkin: {
        type: ["string", "null"],
        description: "Requested check-in date as YYYY-MM-DD, or null if no date range was mentioned.",
      },
      checkout: {
        type: ["string", "null"],
        description: "Requested check-out date as YYYY-MM-DD, or null if no date range was mentioned.",
      },
      guestPrice: {
        type: ["number", "null"],
        description: "A per-night price the guest explicitly proposed or asked for, or null.",
      },
    },
    required: [],
  },
};

// 3.2 turns a free-text guest message into structured fields the rest of the
// flow acts on. This never decides availability or bookings — it only reads
// the guest's words; the database stays the source of truth for what's
// actually free (design.md: deterministic queries, not LLM guesses).
export async function extractInquiryDetails(
  message: string,
  properties: Pick<Property, "name">[],
): Promise<InquiryExtraction> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: `Today's date is ${todayISO()}. The host's properties are: ${
      properties.map((p) => p.name).join(", ") || "(none)"
    }. Resolve relative dates (e.g. "next week", "prossima settimana") against today's date. Call record_inquiry_details with whatever you found; use null for anything not mentioned. Do not guess a property name that isn't in the list above.`,
    messages: [{ role: "user", content: message }],
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "record_inquiry_details" },
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    return { propertyName: null, checkin: null, checkout: null, guestPrice: null };
  }
  const input = block.input as Partial<InquiryExtraction>;
  return {
    propertyName: input.propertyName ?? null,
    checkin: input.checkin ?? null,
    checkout: input.checkout ?? null,
    guestPrice: input.guestPrice ?? null,
  };
}

const I_DONT_KNOW = "I_DONT_KNOW";

// 3.5 FAQ fallback, grounded only in this property's configured data.
// Returns null when the model can't answer from that data — the caller
// escalates to the host instead of showing an unanswered message.
export async function answerFaqFallback(message: string, property: Property): Promise<string | null> {
  const propertyFacts = [
    `Name: ${property.name}`,
    `Price per night: ${property.price_per_night} ${property.currency}`,
    `Minimum nights: ${property.min_nights}`,
    `Check-in time: ${property.checkin_time}`,
    `House rules: ${property.house_rules || "(none configured)"}`,
    `Amenities: ${property.amenities || "(none configured)"}`,
  ].join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: `You are a WhatsApp assistant answering a guest's question about one property. Answer ONLY using the facts below — never invent anything that isn't listed. If the answer isn't in these facts, respond with exactly "${I_DONT_KNOW}" and nothing else. Keep replies short, friendly, and suitable for WhatsApp.\n\n${propertyFacts}`,
    messages: [{ role: "user", content: message }],
  });

  const block = response.content.find((b) => b.type === "text");
  const text = block && block.type === "text" ? block.text.trim() : "";
  if (!text || text === I_DONT_KNOW) return null;
  return text;
}

// 3.9 multi-property proposals — the search itself (which properties, which
// dates, which prices) already happened as a deterministic DB query
// (bookings.ts). These two calls only phrase that fixed data as a WhatsApp
// reply in the guest's language; they cannot add, invent, or drop an option.

export async function formatAvailabilityReply(
  guestMessage: string,
  range: DateRange,
  matches: PropertyMatch[],
): Promise<string> {
  const data = matches.map((m) => `- ${m.name}: ${m.pricePerNight} ${m.currency}/night`).join("\n");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: `You are a WhatsApp assistant. A guest asked about availability for ${range.checkin} to ${range.checkout}. These properties are available — this is the ONLY data you may state, never add, invent, or omit an option:\n${data}\n\nWrite a short, friendly WhatsApp reply listing every option with its price, in the same language the guest wrote in.`,
    messages: [{ role: "user", content: guestMessage }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : data;
}

export async function formatAlternativesReply(
  guestMessage: string,
  range: DateRange,
  alternatives: AlternativeWindow[],
): Promise<string> {
  const data = alternatives
    .map(
      (alt) =>
        `${alt.range.checkin} to ${alt.range.checkout}: ${alt.matches
          .map((m) => `${m.name} (${m.pricePerNight} ${m.currency}/night)`)
          .join(", ")}`,
    )
    .join("\n");
  const instruction =
    alternatives.length === 0
      ? "No alternative dates are available in the near future either — say so, apologetically, and that you'll follow up if something opens."
      : `These alternative date ranges ARE available — this is the ONLY data you may state:\n${data}\n\nPropose them clearly, each with its price.`;
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: `You are a WhatsApp assistant. A guest asked about availability for ${range.checkin} to ${range.checkout}, but nothing is available for those exact dates. ${instruction} Reply in the same language the guest wrote in. Keep it short.`,
    messages: [{ role: "user", content: guestMessage }],
  });
  const block = response.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : data;
}
