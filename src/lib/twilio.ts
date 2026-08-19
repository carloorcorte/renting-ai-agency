import Twilio from "twilio";

const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
// Fallback only — real sends pass the sending host's own number explicitly
// (each host has their own WhatsApp sender; see hosts.whatsapp_number). This
// env var just lets scripts/tests call these functions without a host in
// hand, e.g. against the shared sandbox number.
const DEFAULT_FROM = process.env.TWILIO_WHATSAPP_NUMBER;

function toWhatsApp(address: string): string {
  return address.startsWith("whatsapp:") ? address : `whatsapp:${address}`;
}

/** `to` and `from` are bare phone numbers (e.g. "+34600111222") or
 * already-prefixed "whatsapp:+...". `from` must be the sending host's own
 * WhatsApp number (hosts.whatsapp_number) — every host has their own Twilio
 * sender, so this can never be a single hardcoded default once there's more
 * than one host.
 *
 * Only actually deliverable within 24h of the recipient's last message to
 * us — WhatsApp requires an approved template outside that window. Use
 * sendWhatsAppTemplate for anything sent on a schedule rather than as a
 * direct reply (design.md: "Messages outside the 24-hour session window..."). */
export async function sendWhatsAppMessage(to: string, body: string, from: string = DEFAULT_FROM ?? ""): Promise<void> {
  await client.messages.create({ from: toWhatsApp(from), to: toWhatsApp(to), body });
}

/** Sends a pre-approved WhatsApp template message (Twilio Content API) —
 * the only way to reach someone outside the 24h free-form window.
 * `contentSid` comes from Twilio's console once Meta approves the template. */
export async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,
  variables: Record<string, string>,
  from: string = DEFAULT_FROM ?? "",
): Promise<void> {
  await client.messages.create({
    from: toWhatsApp(from),
    to: toWhatsApp(to),
    contentSid,
    contentVariables: JSON.stringify(variables),
  });
}

const SMS_FROM = process.env.TWILIO_SMS_NUMBER;

/** Plain SMS — used for host-directed notifications, which have neither a
 * consumer WhatsApp app to arrive on nor a 24h-window/template constraint. */
export async function sendSms(to: string, body: string): Promise<void> {
  await client.messages.create({ from: SMS_FROM, to, body });
}

/** Strips Twilio's "whatsapp:" prefix down to a bare phone number, e.g. for
 * storing/matching guest_phone. */
export function stripWhatsAppPrefix(address: string): string {
  return address.startsWith("whatsapp:") ? address.slice("whatsapp:".length) : address;
}
