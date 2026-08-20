import { BookingConflictError, createInquiry, findAlternativeDateRanges, isPropertyAvailable, searchAvailability } from "./bookings.ts";
import { confirmBookingAndScheduleCheckin } from "./checkin.ts";
import { appendMessage, findOrCreateConversation, setConversationProperty, setNeedsReply } from "./conversations.ts";
import type { DateRange } from "./dates.ts";
import { getHostByWhatsAppNumber } from "./hosts.ts";
import { answerFaqFallback, extractInquiryDetails, formatAlternativesReply, formatAvailabilityReply } from "./llm.ts";
import { getPropertiesForHost } from "./properties.ts";
import { evaluateRules } from "./rules.ts";
import { sendSms, sendWhatsAppMessage, stripWhatsAppPrefix } from "./twilio.ts";
import type { Conversation, Host, Property } from "./types.ts";

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
  await appendMessage(conversation.id, "inbound", "guest", body);

  const properties = await getPropertiesForHost(host.id);
  const extraction = await extractInquiryDetails(body, properties);

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
    await handleMultiPropertySearch(host, conversation, body, range);
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
  guestName: string,
): Promise<void> {
  // 3.3 rules run first, deterministically, before anything else.
  const rule = await evaluateRules(property, range, guestPrice);
  if (rule) {
    if (rule.action === "auto_confirm") {
      try {
        const booking = await createInquiry({
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
          await handleSinglePropertyAvailability(host, conversation, property, range, guestName);
          return;
        }
        throw err;
      }
    }
    await reply(host, conversation, rule.reply_template);
    return;
  }

  // No rule matched — answer availability directly (deterministic, not LLM).
  await handleSinglePropertyAvailability(host, conversation, property, range, guestName);
}

async function handleSinglePropertyAvailability(
  host: Host,
  conversation: Conversation,
  property: Property,
  range: DateRange,
  guestName: string,
): Promise<void> {
  const available = await isPropertyAvailable(property.id, range);
  if (available) {
    // Track this as a pending inquiry so it shows up on the dashboard for
    // the host to confirm/decline — nothing here blocks the dates yet, only
    // an actual confirmation does (spec: Booking Lifecycle Status).
    await createInquiry({
      propertyId: property.id,
      range,
      guestName,
      guestPhone: conversation.guest_phone,
      conversationId: conversation.id,
    });
  }
  const message = available
    ? `${property.name} è disponibile dal ${range.checkin} al ${range.checkout}, a ${property.price_per_night} ${property.currency}/notte. Te la confermiamo a breve!`
    : `${property.name} non è disponibile dal ${range.checkin} al ${range.checkout}.`;
  await reply(host, conversation, message);
}

async function handleMultiPropertySearch(
  host: Host,
  conversation: Conversation,
  guestMessage: string,
  range: DateRange,
): Promise<void> {
  const matches = await searchAvailability(host.id, range);
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
