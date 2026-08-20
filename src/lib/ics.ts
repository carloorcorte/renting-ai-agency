// Minimal RFC 5545 (iCalendar) writer — the read-only half of "connect
// bookings to Google/Apple Calendar". Both apps can subscribe to a plain
// .ics URL natively (Settings → Add calendar → From URL / By URL), so this
// needs no OAuth, no library, just text generation. One-way (our bookings ->
// their calendar); pulling their events back into ours would need OAuth/
// CalDAV per provider, a separate feature.
//
// ponytail: no line folding for lines over 75 octets (RFC 5545 §3.1) — guest
// names/property names here are short enough in practice. Add folding if a
// host ever has genuinely long values and a calendar app starts rejecting
// the feed.

export interface IcsBooking {
  id: string;
  property_name: string;
  guest_name: string;
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD, exclusive — matches iCal's DTEND semantics exactly
  status: "confirmed" | "inquiry" | string;
}

function escapeIcsText(value: string): string {
  return value.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
}

function toIcsDate(iso: string): string {
  return iso.replaceAll("-", "");
}

export function buildIcs(hostName: string, bookings: IcsBooking[]): string {
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Booking Assistant//Host Bookings//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcsText(`${hostName} — Bookings`)}`,
    ...bookings.flatMap((b) => [
      "BEGIN:VEVENT",
      `UID:booking-${b.id}@booking-assistant`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(b.checkin)}`,
      `DTEND;VALUE=DATE:${toIcsDate(b.checkout)}`,
      `SUMMARY:${escapeIcsText(`${b.property_name} — ${b.guest_name || "Guest"}`)}`,
      `STATUS:${b.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
