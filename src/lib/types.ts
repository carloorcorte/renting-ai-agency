export interface Host {
  id: string;
  email: string;
  name: string;
  /** Null until the host has a dedicated WhatsApp Business number attached
   * (manual Twilio onboarding, see README.md) — self-signup leaves this
   * null. */
  whatsapp_number: string | null;
  /** Separate from whatsapp_number — that number has no consumer WhatsApp
   * app attached, so host-directed notifications go out as SMS here instead. */
  notification_phone: string | null;
  /** Id of the dedicated Google Calendar this app created for the host, once
   * they've connected one (googleCalendarSync.ts) — null if not connected.
   * The refresh token that goes with it is deliberately NOT on this type,
   * same reasoning as password_hash: fetch it only where it's actually used
   * (see hosts.getHostGoogleCalendarAuth). */
  google_calendar_id: string | null;
}

export interface Property {
  id: string;
  host_id: string;
  name: string;
  price_per_night: string; // numeric comes back from pg as a string
  currency: string;
  min_nights: number;
  house_rules: string;
  amenities: string;
  checkin_time: string;
  checkin_instructions: string;
  reminder_days_before_checkin: number;
  host_notify_days_before_checkin: number;
  checkin_instructions_days_before: number;
}

export type BookingStatus = "inquiry" | "confirmed" | "declined" | "cancelled";
export type BookingSource = "whatsapp" | "manual";

export interface Booking {
  id: string;
  property_id: string;
  status: BookingStatus;
  checkin: string;
  checkout: string;
  guest_name: string;
  guest_phone: string;
  price: string | null;
  source: BookingSource;
  conversation_id: string | null;
  created_at: string;
}

/** A booking summary already sent to the guest, awaiting a plain yes/no
 * reply (guestReply.ts) before createInquiryAndSync is ever called. */
export interface PendingProposal {
  propertyId: string;
  checkin: string;
  checkout: string;
  guestCount: number | null;
  totalPrice: string;
}

export interface Conversation {
  id: string;
  host_id: string;
  property_id: string | null;
  guest_phone: string;
  needs_reply: boolean;
  pending_proposal: PendingProposal | null;
  created_at: string;
  updated_at: string;
}

export type MessageDirection = "inbound" | "outbound";
export type MessageSender = "guest" | "assistant" | "host";

export interface Message {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  sent_by: MessageSender;
  body: string;
  created_at: string;
}

export type RuleAction = "auto_confirm" | "auto_reply";

export interface RuleConditions {
  /** If the guest states a price, it must be at least this much per night.
   * If the guest doesn't mention a price, the condition is treated as met
   * (no discount was asked for). */
  min_price_per_night?: number;
  min_nights?: number;
}

export interface Rule {
  id: string;
  property_id: string;
  /** Dates being available is always implicitly required on top of these. */
  conditions: RuleConditions;
  action: RuleAction;
  reply_template: string;
  enabled: boolean;
}

export interface PropertyMatch {
  propertyId: string;
  name: string;
  pricePerNight: string;
  currency: string;
}
