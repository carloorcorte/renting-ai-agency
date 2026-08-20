import { BookingConflictError, findAlternativeDateRanges, isPropertyAvailable, searchAvailability } from "./bookings.ts";
import { confirmBookingAndScheduleCheckin, createInquiryAndSync } from "./checkin.ts";
import {
  appendMessage,
  findOrCreateConversation,
  getMessagesForConversation,
  setConversationProperty,
  setNeedsReply,
  setPendingProposal,
} from "./conversations.ts";
import { type DateRange, nights } from "./dates.ts";
import { isConfirmation, isDecline } from "./guestReply.ts";
import { getHostByWhatsAppNumber } from "./hosts.ts";
import { answerFaqFallback, extractInquiryDetails, formatAlternativesReply, formatAvailabilityReply } from "./llm.ts";
import { getProperty, getPropertiesForHost } from "./properties.ts";
import { evaluateRules } from "./rules.ts";
import { sendSms, sendWhatsAppMessage, stripWhatsAppPrefix } from "./twilio.ts";
import type { Conversation, Host, PendingProposal, Property } from "./types.ts";

// 3.1–3.9 orchestrates one inbound WhatsApp message end to end. Called by the
// webhook route after Twilio's signature has been verified.
export async function handleInboundMessage(
  fromRaw: string,
  toRaw: string,
  body: string,
  guestNameHint?: string,
): Promise<void> {
  const guestPhone = stripWhatsAppPrefix(fromRaw);
  const hostNumber = stripWhatsAppPrefix(toRaw);

  const host = await getHostByWhatsAppNumber(hostNumber);
  if (!host) {
    console.error(`No host is configured for WhatsApp number ${hostNumber}`);
    return;
  }

  const conversation = await findOrCreateConversation(host.id, guestPhone);
  // Fetched before appendMessage so it doesn't include the message we're
  // about to extract from — last 10 is plenty for a booking inquiry thread
  // and keeps the extraction call's token cost bounded.
  const history = (await getMessagesForConversation(conversation.id)).slice(-10);
  await appendMessage(conversation.id, "inbound", "guest", body);

  // A summary was already sent and is waiting on a plain yes/no — decided
  // by keyword match, not the LLM (design.md: only deterministic code may
  // trigger a booking). Anything that isn't a clear yes/no falls through to
  // the normal flow below (the guest might be asking something else, or
  // changing the request instead of answering it).
  if (conversation.pending_proposal) {
    if (isDecline(body)) {
      await setPendingProposal(conversation.id, null);
      await reply(host, conversation, "Nessun problema! Se hai altre domande o cambi idea, sono qui. 😊");
      return;
    }
    if (isConfirmation(body)) {
      await finalizeProposal(host, conversation, conversation.pending_proposal, guestNameHint ?? "");
      return;
    }
  }

  const properties = await getPropertiesForHost(host.id);
  const extraction = await extractInquiryDetails(body, properties, history);

  // 3.2 resolve which property (if any) this message is about.
  let propertyId = conversation.property_id;
  if (extraction.propertyName) {
    const named = properties.find((p) => p.name.toLowerCase() === extraction.propertyName!.toLowerCase());
    if (named) propertyId = named.id;
  }
  if (propertyId && propertyId !== conversation.property_id) {
    await setConversationProperty(conversation.id, propertyId);
  }

  const range: DateRange | null =
    extraction.checkin && extraction.checkout ? { checkin: extraction.checkin, checkout: extraction.checkout } : null;

  // 3.9 no named property but a date range was asked about -> search across
  // every property the host owns.
  if (range && !propertyId) {
    await handleMultiPropertySearch(host, conversation, body, range, extraction.guestCount);
    return;
  }

  if (!propertyId) {
    // Neither a property nor a date range to ground a reply in.
    await escalate(host, conversation);
    return;
  }

  const property = properties.find((p) => p.id === propertyId);
  if (!property) {
    await escalate(host, conversation);
    return;
  }

  if (range) {
    await handleSinglePropertyInquiry(
      host,
      conversation,
      property,
      range,
      extraction.guestPrice ?? undefined,
      extraction.guestCount,
      guestNameHint ?? "",
    );
    return;
  }

  // 3.5 general FAQ question about an already-established property.
  const answer = await answerFaqFallback(body, property);
  if (answer === null) {
    await escalate(host, conversation);
    return;
  }
  await reply(host, conversation, answer);
}

async function handleSinglePropertyInquiry(
  host: Host,
  conversation: Conversation,
  property: Property,
  range: DateRange,
  guestPrice: number | undefined,
  guestCount: number | null,
  guestName: string,
): Promise<void> {
  // 3.3 rules run first, deterministically, before anything else. A host's
  // own auto_confirm rule is a deliberate opt-in to zero-friction instant
  // booking, so it deliberately skips the propose-then-confirm step below —
  // that step is the *default* behavior, not one every path goes through.
  const rule = await evaluateRules(property, range, guestPrice);
  if (rule) {
    if (rule.action === "auto_confirm") {
      try {
        const booking = await createInquiryAndSync({
          propertyId: property.id,
          range,
          guestName,
          guestPhone: conversation.guest_phone,
          conversationId: conversation.id,
        });
        await confirmBookingAndScheduleCheckin(booking.id);
      } catch (err) {
        if (err instanceof BookingConflictError) {
          // Someone else booked these exact dates between the rule check and
          // now — fall through to a plain availability answer instead of
          // confirming something that's no longer free.
          await handleSinglePropertyAvailability(host, conversation, property, range, guestCount);
          return;
        }
        throw err;
      }
    }
    await reply(host, conversation, rule.reply_template);
    return;
  }

  // No rule matched — answer availability directly (deterministic, not LLM).
  await handleSinglePropertyAvailability(host, conversation, property, range, guestCount);
}

async function handleSinglePropertyAvailability(
  host: Host,
  conversation: Conversation,
  property: Property,
  range: DateRange,
  guestCount: number | null,
): Promise<void> {
  const available = await isPropertyAvailable(property.id, range);
  if (!available) {
    await reply(host, conversation, `${property.name} non è disponibile dal ${range.checkin} al ${range.checkout}.`);
    return;
  }
  await proposeBooking(host, conversation, property, range, guestCount);
}

// Nothing is booked yet — just a summary held on the conversation
// (pending_proposal) until the guest replies yes/no (see the gate at the
// top of handleInboundMessage). Requested by a host after watching a real
// conversation where "Prenoto" silently created an inquiry with no
// guest-facing total price or explicit confirmation step.
async function proposeBooking(
  host: Host,
  conversation: Conversation,
  property: Property,
  range: DateRange,
  guestCount: number | null,
): Promise<void> {
  const tripNights = nights(range);
  const totalPrice = (Number(property.price_per_night) * tripNights).toFixed(2);
  const proposal: PendingProposal = { propertyId: property.id, checkin: range.checkin, checkout: range.checkout, guestCount, totalPrice };
  await setPendingProposal(conversation.id, proposal);

  const guestLine = guestCount ? `👥 ${guestCount} ospiti\n` : "";
  const message =
    `Ecco il riepilogo:\n` +
    `🏠 ${property.name}\n${guestLine}` +
    `📅 ${range.checkin} → ${range.checkout} (${tripNights} nott${tripNights === 1 ? "e" : "i"})\n` +
    `💰 Totale: ${totalPrice} ${property.currency}\n\n` +
    `Confermi la prenotazione? Rispondi "sì" per confermare.`;
  await reply(host, conversation, message);
}

// Called once the guest has said yes to a pending proposal — the only place
// createInquiryAndSync gets called for the "no rule matched" path.
async function finalizeProposal(
  host: Host,
  conversation: Conversation,
  proposal: PendingProposal,
  guestName: string,
): Promise<void> {
  await setPendingProposal(conversation.id, null);
  const range: DateRange = { checkin: proposal.checkin, checkout: proposal.checkout };
  try {
    await createInquiryAndSync({
      propertyId: proposal.propertyId,
      range,
      guestName,
      guestPhone: conversation.guest_phone,
      conversationId: conversation.id,
    });
    await reply(host, conversation, "🎉 Prenotazione registrata! Te la confermiamo a breve.");
  } catch (err) {
    if (err instanceof BookingConflictError) {
      // Someone else booked these exact dates between the proposal and this
      // confirmation — tell the guest plainly instead of pretending it went
      // through.
      await reply(
        host,
        conversation,
        "Ci dispiace, nel frattempo quelle date sono state prenotate da qualcun altro. Vuoi che controlliamo altre date?",
      );
      return;
    }
    throw err;
  }
}

async function handleMultiPropertySearch(
  host: Host,
  conversation: Conversation,
  guestMessage: string,
  range: DateRange,
  guestCount: number | null,
): Promise<void> {
  const matches = await searchAvailability(host.id, range);

  if (matches.length === 1) {
    // Unambiguous — exactly one property matches, so treat it the same as
    // the guest naming it directly: resolve the conversation to it and
    // propose the booking instead of just listing "one option."
    await setConversationProperty(conversation.id, matches[0].propertyId);
    const property = await getProperty(matches[0].propertyId);
    if (property) {
      await proposeBooking(host, conversation, property, range, guestCount);
      return;
    }
  }

  if (matches.length > 0) {
    await reply(host, conversation, await formatAvailabilityReply(guestMessage, range, matches));
    return;
  }
  const alternatives = await findAlternativeDateRanges(host.id, range);
  await reply(host, conversation, await formatAlternativesReply(guestMessage, range, alternatives));
}

// 3.6 escalation: flag for the host (the dashboard's "needs reply" list is
// the authoritative record — see host-dashboard's Conversation Review), tell
// the guest someone will follow up, and ping the host by SMS if they've set
// a notification number. Not WhatsApp: host.whatsapp_number is the business
// number guests text, with no consumer app attached to receive anything on
// (design.md: "Messages outside the 24-hour session window...").
async function escalate(host: Host, conversation: Conversation): Promise<void> {
  await setNeedsReply(conversation.id, true);
  await reply(host, conversation, "Grazie per il messaggio, l'host ti risponderà a breve.");
  if (host.notification_phone) {
    await sendSms(host.notification_phone, `Nuovo messaggio da rispondere manualmente: conversazione ${conversation.id}.`);
  }
}

// 3.7 / 3.8 log the outbound message and actually send it, from this host's
// own WhatsApp number — never a hardcoded default (see lib/twilio.ts).
async function reply(host: Host, conversation: Conversation, body: string): Promise<void> {
  await appendMessage(conversation.id, "outbound", "assistant", body);
  // Every path into reply() starts from handleInboundMessage's host, which
  // came from getHostByWhatsAppNumber — that lookup only ever matches a host
  // whose whatsapp_number equals the number this message arrived on, so it
  // can't be null here even though Host's type allows it in general
  // (self-signed-up hosts with no number yet never reach this function).
  await sendWhatsAppMessage(conversation.guest_phone, body, host.whatsapp_number!);
}
